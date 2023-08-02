import {Construct} from "constructs";
import {S3Backend} from "cdktf";

export interface S3BackendProps {
    readonly appName: string;
    readonly region: string;
    readonly account: string;
}

export class StandardS3Backend extends Construct {
    constructor(scope: Construct, id: string, props: S3BackendProps) {
        super(scope, id);

        new S3Backend(this, {
            region: props.region,
            key: `service/${props.appName}/terraform.tfstate`,
            bucket: `${props.account}-terraform-${props.region}`,
            dynamodbTable: `${props.account}-terraform-${props.region}`,
            encrypt: true,
        });
    }
}