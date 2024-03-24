import { Config } from '@pulumi/pulumi';

const STACK_NAME = 'public-api';

const publicConfig = new Config(STACK_NAME);
const stage = publicConfig.require('stage');

export function getName(suffix: string): string {
	return `${STACK_NAME}-${stage}-${suffix}`;
}
