import { getName } from './_utils';
import { Provider, Region, acm, apigateway, route53 } from '@pulumi/aws';

export const createApiGatewayResources = async (stackName: string, stage: string, domain: string, dnsZone: string) => {
	const awsRegion = new Provider(`${stackName}-${stage}-provider-us-east-1`, { region: 'us-east-1' as Region });
	const zone = route53.getZoneOutput({ name: dnsZone });

	const sslCertificate = await new acm.Certificate(getName('sslCert'), { domainName: domain, validationMethod: 'DNS' }, { provider: awsRegion });

	const sslCertificateValidationDnsRecord = await new route53.Record(getName('sslCertValidationDnsRecord'), {
		zoneId: zone.id,
		name: sslCertificate.domainValidationOptions[0].resourceRecordName,
		type: sslCertificate.domainValidationOptions[0].resourceRecordType,
		records: [sslCertificate.domainValidationOptions[0].resourceRecordValue],
		ttl: 10 * 60,
	});

	const validatedCertificate = await new acm.CertificateValidation(
		getName('sslCertValidation'),
		{ certificateArn: sslCertificate.arn, validationRecordFqdns: [sslCertificateValidationDnsRecord.fqdn] },
		{ provider: awsRegion }
	);

	const apiDomain = new apigateway.DomainName(getName('apiDomain'), {
		certificateArn: validatedCertificate.certificateArn,
		domainName: domain,
	});

	new route53.Record(getName('record'), {
		name: apiDomain.domainName,
		type: 'A',
		zoneId: zone.id,
		aliases: [
			{
				evaluateTargetHealth: true,
				name: apiDomain.cloudfrontDomainName,
				zoneId: apiDomain.cloudfrontZoneId,
			},
		],
	});

	const restApi = new apigateway.RestApi(getName('restApi'), {
		name: getName('restApi'),
		description: domain,
	});

	return { restApi, apiDomain };
};
