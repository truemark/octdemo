import {Workspace} from "./lib/enums";
import {DeploymentSpecTemplateSpecContainerReadinessProbe} from "@cdktf/provider-kubernetes/lib/deployment";
import {Fn, TerraformStack} from "cdktf";
import {Construct} from "constructs";
import {AwsProvider} from "@cdktf/provider-aws/lib/provider";
import {DataAwsEksCluster} from "@cdktf/provider-aws/lib/data-aws-eks-cluster";
import {DataAwsEksClusterAuth} from "@cdktf/provider-aws/lib/data-aws-eks-cluster-auth";
import {KubernetesProvider} from "@cdktf/provider-kubernetes/lib/provider";
import {KubernetesServiceDeployment} from "./lib/kubernetes-service-deployment";
import {ExternalSecret} from "./lib/external-secret";
import {
    DeploymentSpecTemplateSpecContainerResources
} from "@cdktf/provider-kubernetes/lib/deployment/index-structs/structs0";
import {ServiceMapping} from "./lib/service-mapping";
import {StandardS3Backend} from "./lib/standard-s3-backend";

export interface MasterDataStackProps {
    readonly appName: string;
    readonly servicePort: number;
    readonly containerPort: number;
    readonly namespace: string;
    readonly region: string;
    readonly account: string;
    readonly workspace: Workspace; // dev/qa/stage/prod
    readonly image: string;
    readonly replicas: number;
    readonly priority: number;
    readonly readinessProbe?: DeploymentSpecTemplateSpecContainerReadinessProbe;
    readonly resources?: DeploymentSpecTemplateSpecContainerResources;
    readonly environmentVariables?: { [name: string]: string };
}

export class MasterDataStack extends TerraformStack {
    constructor(scope: Construct, id: string, props: MasterDataStackProps) {
        super(scope, id);

        new AwsProvider(this, "AWS", {
            region: props.region,
        });

        new StandardS3Backend(this, "S3Backend", {
            appName: props.appName,
            region: props.region,
            account: props.account
        });

        const dataAwsEksCluster = new DataAwsEksCluster(this, "Cluster", {
            name: "services",
        });
        const dataAwsEksClusterAuth = new DataAwsEksClusterAuth(this, "ClusterAuth", {
            name: "services",
        });

        new KubernetesProvider(this, "KubernetesProvider", {
            clusterCaCertificate: Fn.base64decode(
                dataAwsEksCluster.certificateAuthority.get(0).data
            ),
            host: dataAwsEksCluster.endpoint,
            token: dataAwsEksClusterAuth.token,
        });

        const deployment = new KubernetesServiceDeployment(this, "Deployment", {
            appName: props.appName,
            servicePort: props.servicePort,
            containerPort: props.containerPort,
            namespace: props.namespace,
            workspace: props.workspace,
            image: props.image,
            replicas: props.replicas,
            readinessProbe: props.readinessProbe,
            resources: props.resources,
            environmentVariables: props.environmentVariables,
            externalSecrets: [
                new ExternalSecret(this, "HelloParameterStoreSecrets", {
                    provider: "ParameterStore",
                    namespace: props.namespace,
                    keys: {
                        MESSAGE: `${props.workspace}/app/hello/message`
                    }
                })
            ]
            //     new ExternalSecret(this, "CoreMasterDataVaultSecrets", {
            //         provider: "Vault",
            //         namespace: props.namespace,
            //         keys: {
            //             OCT_VAULT_APOLLOSTUDIO_CCGATEWAY_GRAPH_NAME: `${props.workspace}/apollostudio/ccgateway:GRAPH_NAME`,
            //             OCT_VAULT_APOLLOSTUDIO_CCGATEWAY_GRAPH_VARIANT: `${props.workspace}/apollostudio/ccgateway:GRAPH_VARIANT`,
            //             OCT_VAULT_APOLLOSTUDIO_CCGATEWAY_KEY: `${props.workspace}/apollostudio/ccgateway:KEY`
            //         }
            //     }),
            // ]
        });

        //const subdomain = props.workspace === "prod" ? "prod" : "non-prod";
        new ServiceMapping(this, "ServiceMapping", {
            deploymentName: deployment.name,
            hostHeader: `${deployment.name}.peculiar.dev`,
            albTargetGroupArn: deployment.albTargetGroupArn,
            priority: props.priority
        });
    }
}
