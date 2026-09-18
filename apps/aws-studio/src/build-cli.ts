import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { renderAwsStudioBundle } from "./build";

const outputDirectory = resolve(process.argv[2] ?? "apps/aws-studio/dist");
const bundle = renderAwsStudioBundle({
  region: process.env.AWS_REGION,
  apiUrl: process.env.AXCAS_API_URL,
  cognitoUserPoolId: process.env.AXCAS_COGNITO_USER_POOL_ID,
  cognitoClientId: process.env.AXCAS_COGNITO_CLIENT_ID,
  whatsappNumber: process.env.AXCAS_WHATSAPP_NUMBER,
});

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all(Object.entries(bundle).map(([name, contents]) => writeFile(resolve(outputDirectory, name), contents, "utf8")));
process.stdout.write(`Built ${Object.keys(bundle).length} Axcas Studio files in ${outputDirectory}\n`);
