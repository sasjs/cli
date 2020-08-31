import path from "path";
import chalk from "chalk";
import {
  readFile,
  getSubFoldersInFolder,
  getFilesInFolder,
  getIniFilesInFolder,
  createFile,
  createFolder,
  deleteFolder,
  fileExists
} from "../utils/file-utils";
import { asyncForEach } from "../utils/utils";

const whiteListedDBExtensions = ["ddl", "sas"];
let buildDestinationFolder = "";
let buildSourceDBFolder = "";
let buildDestinationDBFolder = "";

export async function buildDB() {
  const CONSTANTS = require("../constants");
  buildDestinationFolder = CONSTANTS.buildDestinationFolder;
  buildSourceDBFolder = CONSTANTS.buildSourceDBFolder;
  buildDestinationDBFolder = CONSTANTS.buildDestinationDBFolder;
  await recreateBuildFolder();

  const buildDBFolders = await getSubFoldersInFolder(buildSourceDBFolder);
  const buildDBIniFiles = await getIniFilesInFolder(buildSourceDBFolder);
  let iniFilesContent = {};
  await asyncForEach(buildDBIniFiles, async (buildDBIniFile) => {
    iniFilesContent[buildDBIniFile] = await readFile(
      path.join(buildSourceDBFolder, buildDBIniFile)
    );
  });
  await asyncForEach(buildDBFolders, async (buildDBFolder) => {
    console.log(
      chalk.greenBright("Loading DB: ", chalk.cyanBright(buildDBFolder))
    );
    const folderPath = path.join(buildSourceDBFolder, buildDBFolder);
    const filesNamesInPath = await getFilesInFolder(folderPath);
    const fileExtsInPath = await getFileExts(filesNamesInPath);
    await asyncForEach(fileExtsInPath, async (fileExt) => {
      const destinationFileName = buildDBFolder + "." + fileExt;
      const destinationFilePath = path.join(
        buildDestinationDBFolder,
        destinationFileName
      );
      const filesNamesInPathWithExt = filesNamesInPath.filter((fileName) =>
        fileName.endsWith(fileExt)
      );
      let newDbFileContent = "";
      if (fileExt == "ddl" && iniFilesContent[`${buildDBFolder}.ini`]) {
        newDbFileContent = iniFilesContent[`${buildDBFolder}.ini`];
      }
      await asyncForEach(filesNamesInPathWithExt, async (fileName) => {
        const fileContent = await readFile(path.join(folderPath, fileName));
        newDbFileContent += `\n\n${fileContent}`;
      });
      await createFile(destinationFilePath, newDbFileContent);
      console.log(
        chalk.white("Created file: ", chalk.cyanBright(destinationFilePath))
      );
    });
  });
}

async function recreateBuildFolder() {
  console.log(chalk.greenBright("Recreating to build/DB folder..."));
  const pathExists = await fileExists(buildDestinationFolder);
  if (pathExists) await deleteFolder(buildDestinationDBFolder);
  else await createFolder(buildDestinationFolder);
  await createFolder(buildDestinationDBFolder);
}

function getFileExts(fileNames) {
  let extensions = [];
  fileNames.forEach((fileName) => {
    const ext = fileName.split(".").pop();
    if (whiteListedDBExtensions.includes(ext) && !extensions.includes(ext))
      extensions.push(ext);
  });
  return extensions;
}
