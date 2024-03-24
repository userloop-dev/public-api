import { getName } from './_utils';
import { iam } from '@pulumi/aws';

export const createIamRoles = async (streamArn: string) => {
	const lambdaRole = await new iam.Role(getName('lambdaRole'), {
		assumeRolePolicy: {
			Version: '2012-10-17',
			Statement: [
				{
					Action: 'sts:AssumeRole',
					Principal: { Service: 'lambda.amazonaws.com' },
					Effect: 'Allow',
					Sid: '',
				},
			],
		},
	});

	const firehosePolicy = await new iam.Policy(getName('firehosePolicy'), {
		path: '/',
		description: 'Firehose policy',
		policy: JSON.stringify({
			Version: '2012-10-17',
			Statement: [
				{
					Action: ['firehose:PutRecord'],
					Effect: 'Allow',
					Resource: streamArn,
				},
			],
		}),
	});

	new iam.RolePolicyAttachment(getName('lambdaRoleBasicAttachment'), {
		role: lambdaRole,
		policyArn: iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
	});

	new iam.RolePolicyAttachment(getName('lambdaRoleDynamodbAttachment'), {
		role: lambdaRole,
		policyArn: iam.ManagedPolicy.AmazonDynamoDBFullAccess,
	});

	new iam.RolePolicyAttachment(getName('lambdaRoleFirehoseAttachment'), {
		role: lambdaRole,
		policyArn: firehosePolicy.arn,
	});

	return { lambdaRole };
};
