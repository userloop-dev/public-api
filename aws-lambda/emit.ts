import Stripe from 'stripe';
import { Response, genericHandler } from '/opt/nodejs/_utils';
import { FirehoseClient, PutRecordCommand } from '@aws-sdk/client-firehose';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const textEncoder = new TextEncoder();
const client = new FirehoseClient({ region: 'us-west-2' });
const dynamoDBClient = new DynamoDBClient();

export const handler = async (event: any, context: any): Promise<Response> =>
	genericHandler(event, ['id', 'data'], async (body: any) => {
		const response = await dynamoDBClient.send(
			new QueryCommand({
				TableName: process.env.workspace_key_table as string,
				Select: 'ALL_ATTRIBUTES',
				KeyConditions: {
					api_key: {
						ComparisonOperator: 'EQ',
						AttributeValueList: [{ S: event.requestContext.identity.apiKeyId as string }],
					},
				},
				ReturnConsumedCapacity: 'TOTAL',
			})
		);
		if (response.Items === undefined) throw 'Could not find workspace associated with API Key';
		if (response.Items?.length !== 1) throw 'Found too many workspaces associated with API Key';

		const command = new PutRecordCommand({
			DeliveryStreamName: process.env.stream_name as string,
			Record: {
				Data: textEncoder.encode(
					JSON.stringify({ id: body.id, data: body.data, timestamp: new Date(), workspaceId: response.Items[0]!.workspace_id.S })
				),
			},
		});
		const firehoseCommandResponse = await client.send(command);

		// If the response is 200, then we can assume the record was successfully sent to the firehose and we can now update the stripe subscription
		const subscriptionId = response.Items[0]?.stripe_subscription_item_id.S;
		if (subscriptionId && firehoseCommandResponse.$metadata.httpStatusCode === 200) {
			stripe.subscriptionItems.createUsageRecord(subscriptionId, {
				quantity: 1,
				timestamp: 'now',
			});
		}

		return {
			statusCode: 200,
			body: JSON.stringify({
				message: `Event successfully received for workspace ${response.Items[0]!.workspace_id.S} with id: ${
					body.id
				}. This event should be searchable within the next 5 minutes.`,
			}),
		};
	});
