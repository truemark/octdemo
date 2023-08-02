import {Construct} from "constructs";
import {DataAwsSsmParameter} from "@cdktf/provider-aws/lib/data-aws-ssm-parameter";
import {DataAwsAlb} from "@cdktf/provider-aws/lib/data-aws-alb";
import {DataAwsRoute53Zone} from "@cdktf/provider-aws/lib/data-aws-route53-zone";
import {Route53Record} from "@cdktf/provider-aws/lib/route53-record";
import {AlbListenerRule} from "@cdktf/provider-aws/lib/alb-listener-rule";

export interface ServiceMappingProps {
    readonly deploymentName: string;
    readonly albTargetGroupArn: string;
    readonly hostHeader: string;
    readonly priority: number;
    readonly loadBalancerArnSsmParameterName?: string;
    readonly hostedZoneIdSsmParameterName?: string;
    readonly albListenerArnSsmParameterName?: string;
}

export class ServiceMapping extends Construct {
    constructor(scope: Construct, id: string, props: ServiceMappingProps) {
        super(scope, id);

        const albArn = new DataAwsSsmParameter(this, "LoadBalancerArnSsmParameter", {
            name: props.loadBalancerArnSsmParameterName ?? "/kubernetes/services/ingress/alb/arn"
        }).value;

        const alb = new DataAwsAlb(this, "Alb", {
            arn: albArn,
        });

        const hostedZoneId = new DataAwsSsmParameter(this, "HostedZoneIdSsmParameter", {
            name: props.hostedZoneIdSsmParameterName ?? "/kubernetes/services/ingress/hosted_zone/id"
        }).value;

        const zone = new DataAwsRoute53Zone(this, "Zone", {
            zoneId: hostedZoneId,
        });

        new Route53Record(this, "Record", {
            zoneId: zone.zoneId,
            name: `${props.deploymentName}.${zone.name}`,
            type: 'A',
            alias: {
                name: alb.dnsName,
                zoneId: alb.zoneId,
                evaluateTargetHealth: true
            }
        });

        const listenerArn = new DataAwsSsmParameter(this, "AlbListenerArnSsmParameter", {
            name: props.albListenerArnSsmParameterName ?? "/kubernetes/services/ingress/root_listener/arn"
        }).value;

        new AlbListenerRule(this, "AlbListenerRule", {
            listenerArn,
            priority: props.priority,
            action: [
                {
                    type: "forward",
                    targetGroupArn: props.albTargetGroupArn
                }
            ],
            condition: [
                {
                    hostHeader: { values: [props.hostHeader] }
                }
            ],
        });
    }
}