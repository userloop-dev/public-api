import { Config, interpolate } from '@pulumi/pulumi';
import { apigateway } from '@pulumi/aws';
import { createIamRoles } from './aws-iam';
import { createApiGatewayResources } from './aws-api';
import { createRoute } from './aws-api-route';
import { getName } from './_utils';

const STACK_NAME = 'public-api';
const awsConfig = new Config('aws');
const publicConfig = new Config(STACK_NAME);

const stage = publicConfig.require('stage');
const domain = publicConfig.require('domain');
const dnsZone = publicConfig.require('dns-zone');
const streamArn = publicConfig.require('stream-arn');
const streamName = publicConfig.require('stream-name');
const workspaceKeyTableId = publicConfig.require('workspace_key_table_id');

// For Stripe billing
const stripeSecretKey = publicConfig.require('stripe-secret-key');

export const _setup = async () => {
	const { lambdaRole } = await createIamRoles(streamArn);
	const { restApi, apiDomain } = await createApiGatewayResources(STACK_NAME, stage, domain, dnsZone);

	const resources = {
		STRIPE_SECRET_KEY: interpolate`${stripeSecretKey}`,

		stream_arn: interpolate`${streamArn}`,
		stream_name: interpolate`${streamName}`,
		workspace_key_table: interpolate`${workspaceKeyTableId}`,
	};
	const eventLambdaIntegration = createRoute('emit', { api: restApi, type: 'POST', path: 'emit' }, resources, lambdaRole);

	// Deploy the API and create a new stage
	const deployment = new apigateway.Deployment(getName('deployment'), { restApi: restApi.id }, { dependsOn: [eventLambdaIntegration] });
	const apiStage = new apigateway.Stage(getName('stage'), {
		restApi: restApi.id,
		deployment: deployment.id,
		stageName: 'v1',
	});

	await new apigateway.BasePathMapping(
		getName('apiMapping'),
		{
			restApi: restApi.id,
			domainName: apiDomain.domainName,
			stageName: apiStage.stageName,
		},

		{ dependsOn: [apiDomain, deployment, apiStage] }
	);

	const apiKey = new apigateway.ApiKey(getName('apiKey'), {
		name: 'AdminApiKey',
	});

	const usagePlan = new apigateway.UsagePlan(getName('usagePlan'), {
		name: 'PayPerUsePlan',
		description: 'Pay-per-Use API Key',
		apiStages: [
			{
				apiId: restApi.id,
				stage: apiStage.stageName,
			},
		],
	});

	new apigateway.UsagePlanKey(getName('adminKeyAssociation'), {
		keyId: apiKey.id,
		keyType: 'API_KEY',
		usagePlanId: usagePlan.id,
	});
};
