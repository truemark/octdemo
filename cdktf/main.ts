import {App} from "cdktf";
import {Workspace} from "./lib/enums";
import {HelloWorldStack} from "./hello-world-stack";

const workspace = process.env.TF_WORKSPACE as Workspace; // dev/qa/stage/prod
if (!workspace) throw new Error("Must have a workspace defined.");

const account = process.env.AWS_ACCOUNT_ID;
if (!account) throw new Error("Must have an AWS Account Id defined.");

const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
if (!region) throw new Error("Must have an AWS Region defined.");

const image = process.env.IMAGE;
if (!image) throw new Error("Must have an image tag defined.");

const port = 8080;

// const abbreviatedWorkspace =
//     workspace === "prod" ? "prd"
//         : workspace === "stage" ? "stg"
//             : workspace;

const app = new App();
new HelloWorldStack(app, "HelloWorldStack", {
  appName: "hello",
  servicePort: port,
  containerPort: port,
  namespace: workspace,
  region,
  account,
  workspace,
  image,
  replicas: workspace === "prod" ? 1 : 1,
  resources: {
    limits: {memory: "1536Mi"},
    requests: {memory: "1Gi"}
  },
  priority:
      workspace === "prod" ? 200
          : workspace === "stage" ? 210
              : workspace === "qa" ? 230
              : 220,
  // environmentVariables: {
  //   MESSAGE: workspace === "dev" ? "Hello Dev" : `Hello`,
  // }
});
app.synth();

