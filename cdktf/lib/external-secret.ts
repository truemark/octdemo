import {Construct} from "constructs";
import {manifest} from "@cdktf/provider-kubernetes";
import {DeploymentSpecTemplateSpecContainerEnv} from "@cdktf/provider-kubernetes/lib/deployment";

/**
 * The external secret providers that are currently supported.
 */
export type SecretProvider = 'Vault' | 'ParameterStore' | 'SecretsManager';
/**
 * The properties that are required to create an external secret.
 */
export interface ExternalSecretProps {
    /**
     * The secret provider that this external secret utilizes.
     */
    readonly provider: SecretProvider;
    /**
     * The namespace in which this external secret resides.
     */
    readonly namespace: string;
    /**
     * A map that associates a secret key with its location within the secret provider.
     * The secret key will also be the name of the environment variable it'll be assigned to.
     *
     * @example
     * Vault requires a property, and the beginning "secret/" should be omitted.
     * ParameterStore should not have a property, and the beginning "/" should be omitted.
     * SecretsManager requires a property, and the beginning "/" should be omitted.
     *
     * ```ts
     * { VAULT_KEY: "path/to/key:property" }
     * { PARAMETER_STORE_KEY: "path/to/key" }
     * { SECRETS_MANAGER_KEY: "path/to/key:property" }
     * ```
     * */
    readonly keys: { [secretKey: string]: string };
    /**
     * The name of the cluster secret store in Kubernetes.
     */
    readonly storeName?: string;
    /**
     * How often to check for an updated value from the secret provider. The default is 2880h.
     * @example
     * 10m
     * 1h
     * 1d
     * */
    readonly refreshInterval?: string;
}
/**
 * An external secret and its keys from a provider such as Vault or ParameterStore.
 *
 * Once initialized, the secret keys will be created on Kubernetes as external secrets.
 */
export class ExternalSecret extends Construct {
    private readonly secretName: string;

    constructor(scope: Construct, id: string, private props: ExternalSecretProps) {
        super(scope, id);

        this.secretName = toDashSeparatedLowercase(id)

        // prefix name on manifest name if it needs to be unique across cluster
        new manifest.Manifest(this, `Manifest`, {
            manifest: {
                apiVersion: "external-secrets.io/v1beta1",
                kind: "ExternalSecret",
                metadata: {
                    name: this.secretName,
                    namespace: props.namespace,
                },
                spec: {
                    refreshInterval: props.refreshInterval ?? "24h",
                    secretStoreRef: {
                        name: props.storeName ?? this.getDefaultSecretStoreName(),
                        kind: "ClusterSecretStore"
                    },
                    target: {
                        name: this.secretName
                    },
                    data: Object.entries(props.keys ?? {})
                        .map(([environmentVariable, location]) => {
                            const [path, property] = this.separateLocation(location);
                            return {
                                secretKey: environmentVariable,
                                remoteRef: {
                                    key: path,
                                    property: property,
                                }
                            };
                        }) ?? []
                }
            }
        });
    }

    /**
     * Retrieves the default name for a secret provider in Kubernetes.
     * @private
     */
    private getDefaultSecretStoreName(): string {
        switch(this.props.provider) {
            case "Vault": return "vault-backend";
            case "ParameterStore": return "aws-backend";
            default: throw Error(`Unsupported provider ${this.props.provider} while getting default secret store name`);
        }
    }
    /**
     * Parses a location string into its path and property components based on a given provider.
     * @param location - The location to the secret key. ie. path/to/secret:property
     * @private
     *
     * @remarks  For Vault and Secrets Manager, the location will include a colon and property after the path.
     */
    private separateLocation(location: string): [path: string, property: string | undefined] {
        const [path, property, ...leftover] = location.split(':');
        switch(this.props.provider) {
            case "Vault": {
                if (!property || leftover.length > 0)
                    throw Error(`Must provide exactly one property in location ${location} for provider ${this.props.provider}`);
                return [`secret/${path}`, property];
            }
            case "ParameterStore": {
                if (property || leftover.length > 0)
                    throw Error(`Unexpected property found in location ${location} for provider ${this.props.provider}`);
                return [`/${path}`, undefined];
            }
            case "SecretsManager": {
                if (!property || leftover.length > 0)
                    throw Error(`Must provide exactly one property in location ${location} for provider ${this.props.provider}`);
                return [`/${path}`, property];
            }
            default: throw Error(`Unsupported provider ${this.props.provider} while separating location`);
        }
    }
    /**
     * Converts the external secret keys to environment variables to be used in a Kubernetes Deployment.
     *
     * @returns An array of environment variables to be used.
     */
    public toEnvironmentVariables(): DeploymentSpecTemplateSpecContainerEnv[] {
        return Object.entries(this.props.keys ?? {})
            .map(([environmentVariable]) => {
                return {
                    name: environmentVariable,
                    valueFrom: {
                        secretKeyRef: {
                            name: this.secretName,
                            key: environmentVariable
                        }
                    }
                }
            });
    }

}
// converts any string to dash-separated string
// example: Test Application -> test-application
// example: testApplication -> test-application
function toDashSeparatedLowercase(str: string) {
    if (typeof str !== 'string') throw new TypeError('expected a string');
    return str.trim()
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/\W/g, m => /[À-ž]/.test(m) ? m : '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-')
        .toLowerCase();
}