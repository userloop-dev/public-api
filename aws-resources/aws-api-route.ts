import { Output, asset, interpolate } from '@pulumi/pulumi';
import { apigateway, lambda, iam } from '@pulumi/aws';
import { getName } from './_utils';

interface Route {
	api: apigateway.RestApi;
	type: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS';
	path: string;
}

const lambdaLayer = new lambda.LayerVersion(getName('lambdaLayer'), {
	layerName: getName('lambdaLayer-utils'),
	code: new asset.AssetArchive({
		'nodejs/_utils': new asset.FileAsset('./build/aws-lambda-layers/_utils.js'),
	}),
	compatibleRuntimes: ['nodejs18.x'],
});

const stripeLambdaLayer = new lambda.LayerVersion(getName('stripeLambdaLayer'), {
	layerName: getName('stripeLambdaLayer'),
	code: new asset.AssetArchive({
		'nodejs/node_modules/stripe': new asset.FileArchive('./node_modules/stripe'),

		// Dependencies of stripe
		'nodejs/node_modules/qs': new asset.FileArchive('./node_modules/qs'),
		'nodejs/node_modules/side-channel': new asset.FileArchive('./node_modules/side-channel'),
		'nodejs/node_modules/call-bind': new asset.FileArchive('./node_modules/call-bind'),
		'nodejs/node_modules/get-intrinsic': new asset.FileArchive('./node_modules/get-intrinsic'),
		'nodejs/node_modules/object-inspect': new asset.FileArchive('./node_modules/object-inspect'),
		'nodejs/node_modules/es-define-property': new asset.FileArchive('./node_modules/es-define-property'),
		'nodejs/node_modules/es-errors': new asset.FileArchive('./node_modules/es-errors'),
		'nodejs/node_modules/function-bind': new asset.FileArchive('./node_modules/function-bind'),
		'nodejs/node_modules/set-function-length': new asset.FileArchive('./node_modules/set-function-length'),
		'nodejs/node_modules/define-data-property': new asset.FileArchive('./node_modules/define-data-property'),
		'nodejs/node_modules/gopd': new asset.FileArchive('./node_modules/gopd'),
		'nodejs/node_modules/has-property-descriptors': new asset.FileArchive('./node_modules/has-property-descriptors'),
		'nodejs/node_modules/has-proto': new asset.FileArchive('./node_modules/has-proto'),
		'nodejs/node_modules/has-symbols': new asset.FileArchive('./node_modules/has-symbols'),
		'nodejs/node_modules/hasown': new asset.FileArchive('./node_modules/hasown'),
	}),
	compatibleRuntimes: ['nodejs18.x'],
});

export const createRoute = (handler: string, route: Route, resources: Record<string, Output<string>>, lambdaRole: iam.Role) => {
	const lambdaFunction = new lambda.Function(getName(handler), {
		code: new asset.AssetArchive({
			'__index.js': new asset.FileAsset(`./build/aws-lambda/${handler}.js`),
		}),
		layers: [lambdaLayer.arn, stripeLambdaLayer.arn],
		runtime: 'nodejs18.x',
		role: lambdaRole.arn,
		handler: '__index.handler',
		environment: {
			variables: resources,
		},
		publish: true,
	});

	const eventResource = new apigateway.Resource(getName(`${handler}-resource`), {
		parentId: route.api.rootResourceId,
		pathPart: route.path,
		restApi: route.api.id,
	});

	const eventMethod = new apigateway.Method(getName(`${handler}-method`), {
		restApi: route.api.id,
		resourceId: eventResource.id,
		httpMethod: route.type,
		authorization: 'NONE',
		apiKeyRequired: true,
	});

	const lambdaIntegration = new apigateway.Integration(getName(`${handler}-integration`), {
		restApi: route.api.id,
		resourceId: eventResource.id,
		httpMethod: eventMethod.httpMethod,
		type: 'AWS_PROXY',
		integrationHttpMethod: route.type,
		uri: lambdaFunction.invokeArn,
	});

	new lambda.Permission(
		getName(`${handler}-permission`),
		{
			action: 'lambda:InvokeFunction',
			principal: 'apigateway.amazonaws.com',
			function: lambdaFunction,
			sourceArn: interpolate`${route.api.executionArn}/*/*`,
		},
		{
			dependsOn: [route.api, lambdaFunction],
		}
	);

	return lambdaIntegration;
};
