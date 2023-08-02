import {Construct} from "constructs";
import {
    Deployment,
    DeploymentSpecTemplateSpecContainerReadinessProbe,
    DeploymentTimeouts
} from "@cdktf/provider-kubernetes/lib/deployment";
import {Service} from "@cdktf/provider-kubernetes/lib/service";
import {Workspace} from "./enums";
import {ExternalSecret} from "./external-secret";
import {
    DeploymentSpecTemplateSpecContainerResources
} from "@cdktf/provider-kubernetes/lib/deployment/index-structs/structs0";
import {DataAwsVpc} from "@cdktf/provider-aws/lib/data-aws-vpc";
import {AlbTargetGroup, AlbTargetGroupHealthCheck} from "@cdktf/provider-aws/lib/alb-target-group";
import {manifest} from "@cdktf/provider-kubernetes";

/**
 * The properties that are required to create an external secret.
 */
export interface KubernetesServiceDeploymentProps {
    /**
     * The short name of the application without the namespace.
     */
    readonly appName: string;
    readonly servicePort: number;
    readonly containerPort: number;
    readonly namespace: string;
    readonly workspace: Workspace;
    readonly image: string;
    readonly replicas: number;
    readonly timeouts?: DeploymentTimeouts;
    readonly readinessProbe?: DeploymentSpecTemplateSpecContainerReadinessProbe;
    readonly resources?: DeploymentSpecTemplateSpecContainerResources;
    readonly environmentVariables?: { [envVar: string]: string };
    readonly externalSecrets?: ExternalSecret[];
    readonly healthCheck?: AlbTargetGroupHealthCheck;
}

export class KubernetesServiceDeployment extends Construct {
    public readonly name: string;
    public readonly albTargetGroupArn: string = "";

    constructor(scope: Construct, id: string, props: KubernetesServiceDeploymentProps) {
        super(scope, id);

        if (!props || props.servicePort < 1 || props.servicePort > 65535) throw Error("Must provide a valid port.");
        if (props.replicas < 0) throw Error("Must provide a valid number of replicas for deployment");

        this.name = `${props.appName}-${props.workspace}`;

        const envVars = Object.entries(props.environmentVariables ?? {}).map(([envVar, value]) => {
            return { name: envVar, value };
        });
        const secretEnvVars = props.externalSecrets?.flatMap(secret => secret.toEnvironmentVariables()) ?? [];

        new Deployment(this, "Deployment", {
            metadata: {
                name: this.name,
                namespace: props.namespace,
            },
            timeouts: props.timeouts ?? {
                create: "5m",
                update: "5m",
                delete: "5m",
            },
            spec: {
                replicas: props.replicas.toString(),
                selector: {
                    matchLabels: {
                        app: props.appName,
                    },
                },
                template: {
                    metadata: {
                        labels: {
                            app: props.appName,
                        },
                    },
                    spec: {
                        container: [
                            {
                                image: props.image,
                                imagePullPolicy: "IfNotPresent",
                                name: props.appName,
                                port: [
                                    {
                                        containerPort: props.containerPort,
                                        protocol: 'TCP'
                                    },
                                ],
                                readinessProbe: {
                                    timeoutSeconds: 15,
                                    periodSeconds: 20,
                                    successThreshold: 1,
                                    failureThreshold: 3,
                                    ...props.readinessProbe ?? {
                                        httpGet: {
                                            path: '/actuator/health',
                                            port: props.containerPort.toString(),
                                            scheme: 'HTTP'
                                        },
                                    }
                                },
                                resources: props.resources,
                                env: [ ...envVars, ...secretEnvVars ]
                            },
                        ],
                        nodeSelector: { platform: "x86" },
                        imagePullSecrets: [
                            { name: "docker-registry" }
                        ],
                    },
                },
            },
        });

        new Service(this, "Service", {
            metadata: {
                name: this.name,
                namespace: props.namespace,
            },
            spec: {
                selector: {
                    app: props.appName,
                },
                port: [
                    {
                        port: props.servicePort,
                        targetPort: props.containerPort.toString(),
                        protocol: "TCP",
                    },
                ],
                type: "ClusterIP",
            },
        });

        const awsVpc = new DataAwsVpc(this, "AwsVpc", {
            tags: { Name: "services" }
        });

        const albTargetGroup = new AlbTargetGroup(this, "NodeTarget", {
            name: this.name,
            port: 80,
            protocol: "HTTP",
            targetType: "ip",
            vpcId: awsVpc.id,
            lifecycle: {
                createBeforeDestroy: true
            },
            healthCheck: props.healthCheck ?? {
                path: "/actuator/health"
            }
        });

        this.albTargetGroupArn = albTargetGroup.arn;

        new manifest.Manifest(this, "TargetGroupBinding", {
            manifest: {
                apiVersion: "elbv2.k8s.aws/v1beta1",
                kind: "TargetGroupBinding",
                metadata: {
                    name: props.appName,
                    namespace: props.namespace,
                },
                spec: {
                    targetType: "ip",
                    serviceRef: {
                        name: this.name,
                        port: props.servicePort
                    },
                    targetGroupARN: this.albTargetGroupArn
                }
            }
        });
    }
}
