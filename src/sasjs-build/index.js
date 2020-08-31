import find from "find";
import path from "path";
import chalk from "chalk";
import { deploy } from "../sasjs-deploy";
import { createWebAppServices } from "../sasjs-web";
import {
  readFile,
  getSubFoldersInFolder,
  getFilesInFolder,
  createFile,
  createFolder,
  deleteFolder,
  fileExists,
  copy
} from "../utils/file-utils";
import { asyncForEach, removeComments, chunk, diff } from "../utils/utils";
import {
  getSourcePaths,
  getConfiguration,
  getTargetToBuild,
  getTargetSpecificFile,
  getMacroCorePath
} from "../utils/config-utils";

let buildSourceFolder = "";
let buildDestinationFolder = "";
let buildDestinationServ = "";
let targetToBuild = null;

export async function build(
  targetName = null,
  compileOnly = false,
  compileBuildOnly = false,
  compileBuildDeployOnly = false
) {
  const CONSTANTS = require("../constants");
  buildSourceFolder = CONSTANTS.buildSourceFolder;
  buildDestinationFolder = CONSTANTS.buildDestinationFolder;
  buildDestinationServ = CONSTANTS.buildDestinationServ;
  targetToBuild = await getTargetToBuild(targetName);
  if (compileBuildDeployOnly) {
    await compile();
    await createFinalSasFiles();
    return await deploy(targetName, targetToBuild);
  }
  if (compileBuildOnly) {
    await compile();
    return await createFinalSasFiles();
  }
  if (compileOnly) return await compile();

  const servicesToCompile = await getAllServices(
    path.join(buildSourceFolder, "sasjsconfig.json")
  );
  const serviceNamesToCompile = servicesToCompile.map((s) =>
    s.split("/").pop()
  );
  const serviceNamesToCompileUniq = [...new Set(serviceNamesToCompile)];
  const result = await validCompiled(serviceNamesToCompileUniq);
  if (result.compiled) {
    // no need to compile again
    console.log(chalk.greenBright(result.message));
    console.log(chalk.white("Skipping compiling of build folders..."));
  } else {
    console.log(chalk.redBright(result.message));
    await compile();
  }
  await createFinalSasFiles();
}

async function compile() {
  await copyFilesToBuildFolder();
  const servicesToCompile = await getAllServices(
    path.join(buildSourceFolder, "sasjsconfig.json")
  );
  const serviceNamesToCompile = servicesToCompile.map((s) =>
    s.split("/").pop()
  );
  const serviceNamesToCompileUniq = [...new Set(serviceNamesToCompile)];

  const tgtMacros = targetToBuild ? targetToBuild.tgtMacros : [];

  await asyncForEach(serviceNamesToCompileUniq, async (buildFolder) => {
    const folderPath = path.join(buildDestinationServ, buildFolder);
    const subFolders = await getSubFoldersInFolder(folderPath);
    const filesNamesInPath = await getFilesInFolder(folderPath);
    await asyncForEach(filesNamesInPath, async (fileName) => {
      const filePath = path.join(folderPath, fileName);
      const dependencies = await loadDependencies(filePath, tgtMacros);
      await createFile(filePath, dependencies);
    });
    await asyncForEach(subFolders, async (subFolder) => {
      const fileNames = await getFilesInFolder(
        path.join(folderPath, subFolder)
      );
      await asyncForEach(fileNames, async (fileName) => {
        const filePath = path.join(folderPath, subFolder, fileName);
        const dependencies = await loadDependencies(filePath, tgtMacros);
        await createFile(filePath, dependencies);
      });
    });
  });
}

async function createFinalSasFiles() {
  const {
    buildOutputFileName,
    appLoc,
    serverType,
    streamWeb,
    tgtMacros,
    name: tgtName
  } = targetToBuild;
  if (streamWeb) {
    await createWebAppServices(null, targetToBuild)
      .then(() =>
        console.log(
          chalk.greenBright.bold.italic(
            `Web app services have been successfully built!`
          )
        )
      )
      .catch((err) => {
        console.log(
          chalk.redBright(
            "An error has occurred when building web app services.",
            err
          )
        );
      });
  }
  await createFinalSasFile(
    buildOutputFileName,
    appLoc,
    serverType,
    tgtMacros,
    tgtName
  );
}

async function createFinalSasFile(
  fileName = "build.sas",
  appLoc,
  serverType,
  tgtMacros = [],
  tgtName = "target"
) {
  console.log(
    chalk.greenBright(`Creating final ${chalk.cyanBright(fileName)} file`)
  );
  let finalSasFileContent = "";
  const finalFilePath = path.join(buildDestinationFolder, fileName);
  const finalFilePathJSON = path.join(
    buildDestinationFolder,
    `${tgtName}.json`
  );
  const buildConfig = await getBuildConfig(appLoc, serverType, tgtMacros);
  finalSasFileContent += `\n${buildConfig}`;

  const { content: buildInit, path: buildInitPath } = await getBuildInit();
  const {
    content: buildTermContent,
    path: buildTermPath
  } = await getBuildTerm();

  console.log(chalk.greenBright("  Loading dependencies for:"));
  console.log(
    "  BuildInit -",
    chalk.greenBright(chalk.cyanBright(buildInitPath))
  );
  console.log(
    "  BuildTerm -",
    chalk.greenBright(chalk.cyanBright(buildTermPath))
  );
  const dependencyFilePaths = await getDependencyPaths(
    `${buildTermContent}\n${buildInit}`,
    tgtMacros
  );
  const dependenciesContent = await getDependencies(dependencyFilePaths);

  finalSasFileContent += `\n${dependenciesContent}\n\n${buildInit}\n`;

  console.log(chalk.greenBright("  - Compiling Services"));
  const { folderContent, folderContentJSON } = await getFolderContent(
    serverType
  );
  finalSasFileContent += `\n${folderContent}`;

  finalSasFileContent += `\n${buildTermContent}`;
  finalSasFileContent = removeComments(finalSasFileContent);
  await createFile(finalFilePath, finalSasFileContent);
  await createFile(
    finalFilePathJSON,
    JSON.stringify(folderContentJSON, null, 1)
  );
}

async function getBuildConfig(appLoc, serverType, tgtMacros = []) {
  let buildConfig = "";
  const createWebServiceScript = await getCreateWebServiceScript(serverType);
  buildConfig += `${createWebServiceScript}\n`;
  const dependencyFilePaths = await getDependencyPaths(buildConfig, tgtMacros);
  const dependenciesContent = await getDependencies(dependencyFilePaths);
  const buildVars = await getBuildVars();
  return `%global appLoc;\n%let appLoc=%sysfunc(coalescec(&appLoc,${appLoc})); /* metadata or files service location of your app */\n%let syscc=0;\noptions ps=max noquotelenmax;\n${buildVars}\n${dependenciesContent}\n${buildConfig}\n`;
}

async function getCreateWebServiceScript(serverType) {
  switch (serverType.toUpperCase()) {
    case "SASVIYA":
      return await readFile(
        `${getMacroCorePath()}/viya/mv_createwebservice.sas`
      );

    case "SAS9":
      return await readFile(
        `${getMacroCorePath()}/meta/mm_createwebservice.sas`
      );

    default:
      throw new Error(
        `Invalid server type: valid options are ${chalk.cyanBright(
          "SASVIYA"
        )} and ${chalk.cyanBright("SAS9")}`
      );
  }
}

function getWebServiceScriptInvocation(serverType) {
  switch (serverType.toUpperCase()) {
    case "SASVIYA":
      return "%mv_createwebservice(path=&appLoc/&path, name=&service, code=sascode ,replace=yes)";
    case "SAS9":
      return "%mm_createwebservice(path=&appLoc/&path, name=&service, code=sascode ,replace=yes)";
    default:
      throw new Error(
        `Invalid server type: valid options are ${chalk.cyanBright(
          "SASVIYA"
        )} and ${chalk.cyanBright("SAS9")}`
      );
  }
}

async function getFolderContent(serverType) {
  const buildSubFolders = await getSubFoldersInFolder(buildDestinationFolder);
  let folderContent = "";
  let folderContentJSON = { members: [] };
  await asyncForEach(buildSubFolders, async (subFolder) => {
    const { content, contentJSON } = await getContentFor(
      path.join(buildDestinationFolder, subFolder),
      subFolder,
      serverType
    );
    folderContent += `\n${content}`;
    folderContentJSON.members.push(contentJSON);
  });
  return { folderContent, folderContentJSON };
}

async function getPreCodeForServicePack(serverType) {
  let content = "";
  switch (serverType.toUpperCase()) {
    case "SASVIYA":
      content += await readFile(`${getMacroCorePath()}/base/mf_getuser.sas`);
      content += await readFile(`${getMacroCorePath()}/base/mp_jsonout.sas`);
      content += await readFile(`${getMacroCorePath()}/viya/mv_webout.sas`);
      content +=
        "/* if calling viya service with _job param, _program will conflict */\n" +
        "/* so we provide instead as __program */\n" +
        "%global __program _program;\n" +
        "%let _program=%sysfunc(coalescec(&__program,&_program));\n" +
        "%macro webout(action,ds,dslabel=,fmt=);\n" +
        "%mv_webout(&action,ds=&ds,dslabel=&dslabel,fmt=&fmt)\n" +
        "%mend;\n";
      break;

    case "SAS9":
      content += await readFile(`${getMacroCorePath()}/base/mf_getuser.sas`);
      content += await readFile(`${getMacroCorePath()}/base/mp_jsonout.sas`);
      content += await readFile(`${getMacroCorePath()}/meta/mm_webout.sas`);
      content +=
        "  %macro webout(action,ds,dslabel=,fmt=);\n" +
        "    %mm_webout(&action,ds=&ds,dslabel=&dslabel,fmt=&fmt)\n" +
        "  %mend;\n";
      break;

    default:
      throw new Error(
        `Invalid server type: valid options are ${chalk.cyanBright(
          "SASVIYA"
        )} and ${chalk.cyanBright("SAS9")}`
      );
  }
  return content;
}

async function getContentFor(folderPath, folderName, serverType) {
  let content = `\n%let path=${folderName === "services" ? "" : folderName};\n`;
  const contentJSON = {
    name: folderName,
    type: "folder",
    members: []
  };
  const files = await getFilesInFolder(folderPath);
  const preCode = await getPreCodeForServicePack(serverType);
  await asyncForEach(files, async (file) => {
    const fileContent = await readFile(path.join(folderPath, file));
    const transformedContent = getServiceText(file, fileContent, serverType);
    content += `\n${transformedContent}\n`;
    contentJSON.members.push({
      name: file.replace(".sas", ""),
      type: "service",
      code: removeComments(`${preCode}\n${fileContent}`)
    });
  });
  const subFolders = await getSubFoldersInFolder(folderPath);
  await asyncForEach(subFolders, async (subFolder) => {
    const {
      content: childContent,
      contentJSON: childContentJSON
    } = await getContentFor(
      path.join(folderPath, subFolder),
      subFolder,
      serverType
    );
    contentJSON.members.push(childContentJSON);
    content += childContent;
  });
  return { content, contentJSON };
}

function getServiceText(serviceFileName, fileContent, serverType) {
  const serviceName = serviceFileName.replace(".sas", "");
  const sourceCodeLines = getLines(removeComments(fileContent));
  let content = ``;
  sourceCodeLines.forEach((line) => {
    const escapedLine = line.split("'").join("''");
    if (escapedLine.trim()) {
      content += `\n put '${escapedLine.trim()}';`;
    }
  });
  return `%let service=${serviceName};
filename sascode temp lrecl=32767;
data _null_;
file sascode;
${content}\n
run;
${getWebServiceScriptInvocation(serverType)}
filename sascode clear;
`;
}

function getLines(text) {
  let lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim());
  return lines;
}

async function copyFilesToBuildFolder() {
  await recreateBuildFolder();
  console.log(chalk.greenBright("Copying files to build folder..."));
  const servicesToCompile = await getAllServices(
    path.join(buildSourceFolder, "sasjsconfig.json")
  );
  await asyncForEach(servicesToCompile, async (buildFolder) => {
    const sourcePath = path.join(buildSourceFolder, buildFolder);
    const buildFolderName = buildFolder.split("/").pop();
    const destinationPath = path.join(buildDestinationServ, buildFolderName);
    await copy(sourcePath, destinationPath);
  });
}

async function recreateBuildFolder() {
  console.log(chalk.greenBright("Recreating to build folder..."));
  const pathExists = await fileExists(buildDestinationFolder);
  if (pathExists) {
    // delete everything other than, db folder
    const subFolders = await getSubFoldersInFolder(buildDestinationFolder);
    const subFiles = await getFilesInFolder(buildDestinationFolder);
    await asyncForEach([...subFolders, ...subFiles], async (subFolder) => {
      if (subFolder == "db") return;
      const subFolderPath = path.join(buildDestinationFolder, subFolder);
      await deleteFolder(subFolderPath);
    });
  } else await createFolder(buildDestinationFolder);
  await createFolder(path.join(buildDestinationServ));
}

export async function loadDependencies(filePath, tgtMacros) {
  console.log(
    chalk.greenBright("Loading dependencies for", chalk.cyanBright(filePath))
  );
  let fileContent = await readFile(filePath);
  const serviceVars = await getServiceVars();
  const serviceInit = await getServiceInit();
  const serviceTerm = await getServiceTerm();
  const dependencyFilePaths = await getDependencyPaths(
    `${fileContent}\n${serviceInit}\n${serviceTerm}`,
    tgtMacros
  );

  const dependenciesContent = await getDependencies(dependencyFilePaths);
  fileContent = `* Service Variables start;\n${serviceVars}\n*Service Variables end;\n* Dependencies start;\n${dependenciesContent}\n* Dependencies end;\n* ServiceInit start;\n${serviceInit}\n* ServiceInit end;\n* Service start;\n${fileContent}\n* Service end;\n* ServiceTerm start;\n${serviceTerm}\n* ServiceTerm end;`;

  return fileContent;
}

async function getBuildInit() {
  return await getTargetSpecificFile("BuildInit", targetToBuild);
}

async function getServiceInit() {
  return (await getTargetSpecificFile("ServiceInit", targetToBuild)).content;
}

async function getServiceTerm() {
  return (await getTargetSpecificFile("ServiceTerm", targetToBuild)).content;
}

async function getBuildTerm() {
  return await getTargetSpecificFile("BuildTerm", targetToBuild);
}

async function getTargetSpecificVars(typeOfVars) {
  let variables = {};
  const configuration = await getConfiguration(
    path.join(buildSourceFolder, "sasjsconfig.json")
  );
  if (configuration[`cmn${typeOfVars}`])
    variables = { ...configuration[`cmn${typeOfVars}`] };
  if (targetToBuild[`tgt${typeOfVars}`])
    variables = { ...variables, ...targetToBuild[`tgt${typeOfVars}`] };

  const entries = Object.entries(variables);
  let varsContent = "\n";
  for (const [name, value] of entries) {
    const chunks = chunk(value);
    const chunkedString = chunks.join("%trim(\n)");
    varsContent += `%let ${name}=${chunkedString};\n`;
  }

  return varsContent;
}

export async function getServiceVars() {
  return await getTargetSpecificVars("ServiceVars");
}

export async function getBuildVars() {
  return await getTargetSpecificVars("BuildVars");
}

async function getDependencies(filePaths) {
  let dependenciesContent = [];
  await asyncForEach(filePaths, async (filePath) => {
    const depFileContent = await readFile(filePath);
    dependenciesContent.push(depFileContent);
  });

  return dependenciesContent.join("\n");
}

export async function getDependencyPaths(fileContent, tgtMacros = []) {
  const sourcePaths = await getSourcePaths(buildSourceFolder);
  if (tgtMacros.length) {
    tgtMacros.forEach((tm) => {
      const tgtMacroPath = path.join(buildSourceFolder, tm);
      sourcePaths.push(tgtMacroPath);
    });
  }
  const dependenciesStart = fileContent.split("<h4> Dependencies </h4>");
  let dependencies = [];
  if (dependenciesStart.length > 1) {
    let count = 1;
    while (count < dependenciesStart.length) {
      let dependency = dependenciesStart[count]
        .split("**/")[0]
        .replace(/\r\n/g, "\n")
        .split("\n")
        .filter((d) => !!d)
        .map((d) => d.replace(/\@li/g, "").replace(/ /g, ""))
        .filter((d) => d.endsWith(".sas"));
      dependencies = [...dependencies, ...dependency];
      count++;
    }
    let dependencyPaths = [];
    const foundDependencies = [];
    await asyncForEach(sourcePaths, async (sourcePath) => {
      await asyncForEach(dependencies, async (dep) => {
        const filePaths = find.fileSync(dep, sourcePath);
        if (filePaths.length) {
          const fileContent = await readFile(filePaths[0]);
          foundDependencies.push(dep);
          dependencyPaths.push(
            ...(await getDependencyPaths(fileContent, tgtMacros))
          );
        }
        dependencyPaths.push(...filePaths);
      });
    });

    const unfoundDependencies = diff(dependencies, foundDependencies);
    if (unfoundDependencies.length) {
      throw new Error(
        `${"Unable to locate dependencies:"} ${chalk.cyanBright(
          unfoundDependencies.join(", ")
        )}`
      );
    }

    dependencyPaths = prioritiseDependencyOverrides(
      dependencies,
      dependencyPaths,
      tgtMacros
    );

    return [...new Set(dependencyPaths)];
  } else {
    return [];
  }
}

export function prioritiseDependencyOverrides(
  dependencyNames,
  dependencyPaths,
  tgtMacros = []
) {
  dependencyNames.forEach((depFileName) => {
    const paths = dependencyPaths.filter((p) => p.includes(`/${depFileName}`));

    let overriddenDependencyPaths = paths.filter(
      (p) => !p.includes("node_modules")
    );
    if (tgtMacros.length) {
      const foundInTgtMacros = overriddenDependencyPaths.filter((p) => {
        const pathExist = tgtMacros.find((tm) => p.includes(tgtMacros));
        return pathExist ? true : false;
      });
      if (foundInTgtMacros.length) overriddenDependencyPaths = foundInTgtMacros;
    }

    if (
      overriddenDependencyPaths.length &&
      overriddenDependencyPaths.length != paths.length
    ) {
      const pathsToRemove = paths.filter(
        (el) => overriddenDependencyPaths.indexOf(el) < 0
      );
      dependencyPaths = dependencyPaths.filter(
        (el) => pathsToRemove.indexOf(el) < 0
      );
      if (overriddenDependencyPaths.length > 1) {
        // remove duplicates
        dependencyPaths = dependencyPaths.filter(
          (p) => p != overriddenDependencyPaths[0]
        );
        dependencyPaths.push(overriddenDependencyPaths[0]);
      }
    }
  });

  return dependencyPaths;
}

async function getCommonServices(pathToFile) {
  const configuration = await getConfiguration(pathToFile);
  return Promise.resolve(configuration.cmnServices);
}

async function getAllServices(pathToFile) {
  const configuration = await getConfiguration(pathToFile);
  let allServices = [];

  if (configuration.cmnServices)
    allServices = [...allServices, ...configuration.cmnServices];
  if (targetToBuild.tgtServices)
    allServices = [...allServices, ...targetToBuild.tgtServices];
  return Promise.resolve(allServices);
}

async function validCompiled(buildFolders) {
  const pathExists = await fileExists(buildDestinationFolder);
  if (!pathExists)
    return {
      compiled: false,
      message: `Build Folder doesn't exists: ${buildDestinationFolder}`
    };

  const subFolders = await getSubFoldersInFolder(buildDestinationServ);
  const present = buildFolders.every((folder) => subFolders.includes(folder));
  if (present) {
    let returnObj = {
      compiled: true,
      message: `All services are already present.`
    };
    await asyncForEach(buildFolders, async (buildFolder) => {
      if (returnObj.compiled) {
        const folderPath = path.join(buildDestinationServ, buildFolder);
        const subFolders = await getSubFoldersInFolder(folderPath);
        const filesNamesInPath = await getFilesInFolder(folderPath);
        if (subFolders.length == 0 && filesNamesInPath.length == 0) {
          returnObj = {
            compiled: false,
            message: `Service folder ${buildFolder} is empty.`
          };
        }
      }
    });
    return returnObj;
  }
  return { compiled: false, message: "All services are not present." };
}
