import SASjs from "@sasjs/adapter/node";
import chalk from "chalk";
import ora from "ora";
import { getVariable } from "../utils/utils";
import { getTargetToBuild } from "../utils/config-utils";
import { getAccessToken } from "../utils/auth-utils";

export async function getContexts(targetName) {
  const startTime = new Date().getTime();
  const buildTarget = await getTargetToBuild(targetName);
  if (!buildTarget) {
    throw new Error(
      "Build target was not found. Please check the target name and try again."
    );
  }

  if (buildTarget.serverType !== "SASVIYA") {
    throw new Error(
      "This command is only supported for SAS Viya build targets.\nPlease check the target name and try again."
    );
  }

  const clientId = await getVariable("client", buildTarget);
  const clientSecret = await getVariable("secret", buildTarget);
  if (!clientId) {
    throw new Error(
      "A client ID is required for SAS Viya deployments.\n Please ensure that `client` is present in your build target configuration or in your .env file, and try again.\n"
    );
  }
  if (!clientSecret) {
    throw new Error(
      "A client secret is required for SAS Viya deployments.\n Please ensure that `secret` is present in your build target configuration or in your .env file, and try again.\n"
    );
  }

  const sasjs = new SASjs({
    serverUrl: buildTarget.serverUrl,
    appLoc: buildTarget.appLoc,
    serverType: buildTarget.serverType,
  });
  const accessToken = await getAccessToken(
    sasjs,
    clientId,
    clientSecret,
    buildTarget,
    true
  );

  const spinner = ora(
    `Checking the compute contexts on ${chalk.greenBright(
      buildTarget.serverUrl
    )}...\n`
  );
  spinner.start();
  const contexts = await sasjs.getExecutableContexts(accessToken);
  const accessibleContexts = contexts.map((context) => ({
    createdBy: context.createdBy,
    id: context.id,
    name: context.name,
    version: context.version,
    sysUserId: context.attributes.sysUserId,
  }));
  const accessibleContextIds = contexts.map((c) => c.id);
  const allContexts = await sasjs.getAllContexts(accessToken);
  const inaccessibleContexts = allContexts
    .filter((context) => !accessibleContextIds.includes(context.id))
    .map((context) => ({
      createdBy: context.createdBy,
      id: context.id,
      name: context.name,
      version: context.version,
      sysUserId: "NOT ACCESSIBLE",
    }));
  const endTime = new Date().getTime();
  spinner.stop();

  console.log(
    chalk.whiteBright(
      `This operation took ${(endTime - startTime) / 1000} seconds.`
    )
  );
  return [accessibleContexts, inaccessibleContexts];
}
