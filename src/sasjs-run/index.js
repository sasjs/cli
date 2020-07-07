import chalk from "chalk";
import path from "path";
import SASjs from "sasjs/node";
import { findTargetInConfiguration } from "../utils/config-utils";
import { readFile } from "../utils/file-utils";
import { getVariable } from "../utils/utils";
import { getAccessToken } from "../utils/auth-utils";

export async function runSasCode(filePath, targetName) {
  const { target, isLocal } = await findTargetInConfiguration(targetName);
  if (!target) {
    throw new Error("Target not found! Please try again with another target.");
  }
  const sasFile = await readFile(path.join(process.cwd(), filePath));
  const linesToExecute = sasFile.replace(/\r\n/g, "\n").split("\n");
  if (target.serverType === "SASVIYA") {
    await executeOnSasViya(filePath, target, linesToExecute, isLocal);
  } else {
    await executeOnSas9(target, linesToExecute);
  }
}

async function executeOnSasViya(
  filePath,
  buildTarget,
  linesToExecute,
  isLocalTarget
) {
  console.log(
    chalk.cyanBright(
      `Sending ${path.basename(filePath)} to SAS server for execution.`
    )
  );

  const sasjs = new SASjs({
    serverUrl: buildTarget.serverUrl,
    appLoc: buildTarget.appLoc,
    serverType: buildTarget.serverType,
  });
  const contextName = await getVariable("contextName", buildTarget);

  if (!contextName) {
    throw new Error(
      "Compute Context Name is required for SAS Viya deployments.\n Please ensure that `contextName` is present in your build target configuration or in your .env file, and try again.\n"
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

  const accessToken = await getAccessToken(
    sasjs,
    clientId,
    clientSecret,
    buildTarget,
    isLocalTarget
  );

  const executionSession = await sasjs
    .createSession(contextName, accessToken)
    .catch((e) => {
      console.log(chalk.redBright.bold("Error creating execution session"));
      throw e;
    });

  const executionResult = await sasjs.executeScriptSASViya(
    path.basename(filePath),
    linesToExecute,
    contextName,
    accessToken,
    executionSession.id
  );

  let log;
  try {
    log = executionResult.log.items
      ? executionResult.log.items.map((i) => i.line).join("\n")
      : JSON.stringify(executionResult.log);
  } catch (e) {
    console.log(
      chalk.redBright(
        `An error occurred when parsing the execution response: ${chalk.redBright.bold(
          e.message
        )}`
      )
    );
    console.log(
      chalk.redBright(
        `Please check your ${chalk.cyanBright("tgtDeployVars")} and try again.`
      )
    );
    log = executionResult;
  }

  console.log(chalk.greenBright("Job execution completed!"));
  console.log(log);
}

async function executeOnSas9(buildTarget, linesToExecute) {
  if (!buildTarget.tgtDeployVars) {
    throw new Error(
      "Deployment config not found!\n Please ensure that your build target has a `tgtDeployVars` property that specifies `serverName` and `repositoryName`.\n"
    );
  }
  const serverName =
    buildTarget.tgtDeployVars.serverName || process.env.serverName;
  const repositoryName =
    buildTarget.tgtDeployVars.repositoryName || process.env.repositoryName;
  if (!serverName) {
    throw new Error(
      "SAS Server Name is required for SAS9 deployments.\n Please ensure that `serverName` is present in your build target configuration and try again.\n"
    );
  }
  if (!repositoryName) {
    throw new Error(
      "SAS Repository Name is required for SAS9 deployments.\n Please ensure that `repositoryName` is present in your build target configuration and try again.\n"
    );
  }
  const sasjs = new SASjs({
    serverUrl: buildTarget.serverUrl,
    appLoc: buildTarget.appLoc,
    serverType: buildTarget.serverType,
  });
  const executionResult = await sasjs.executeScriptSAS9(
    linesToExecute,
    serverName,
    repositoryName
  );

  let parsedLog;
  try {
    parsedLog = JSON.parse(executionResult).payload.log;
  } catch (e) {
    console.error(chalk.redBright(e));
    parsedLog = executionResult;
  }

  console.log(chalk.greenBright("Job execution completed!"));
  console.log(parsedLog);
}
