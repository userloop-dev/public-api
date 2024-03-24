import { AttributeValue } from '@aws-sdk/client-dynamodb';
import { CognitoIdentityProvider } from '@aws-sdk/client-cognito-identity-provider';

export type Response = { statusCode: number; body: string };

export const genericHandler = async (event: any, paramsCheck: string[], f: (body: any) => Promise<Response>): Promise<Response> => {
	try {
		const body = JSON.parse(event.body);
		if (!paramsCheck.every((key: string) => key in body))
			return { statusCode: 500, body: JSON.stringify({ message: `Invalid Params: ${paramsCheck.join(', ')}` }) };
		return await f(body);
	} catch (error) {
		console.log(error); // Log error to CloudWatch Logs
		return { statusCode: 500, body: JSON.stringify({ message: 'Something went wrong while trying to process your request...' }) };
	}
};

export const getUserId = async (cognitoIdentityServiceProvider: CognitoIdentityProvider, access_token: string): Promise<string> => {
	const user = await cognitoIdentityServiceProvider.getUser({ AccessToken: access_token });
	if (!user || !user.UserAttributes) throw 'User attributes not found';
	return user!.UserAttributes!.find((attr: any) => attr.Name === 'sub')?.Value || '';
};

// Core Workspace Types

export type Workspace = {
	workspace_id: AttributeValue.SMember;
	name: AttributeValue.SMember;
	description: AttributeValue.SMember;
};

export type WorkspaceMember = {
	user_id: AttributeValue.SMember;
	workspace_id: AttributeValue.SMember;
	role: AttributeValue.SMember;
};
