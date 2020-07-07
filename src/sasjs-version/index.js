import shelljs from "shelljs";
import chalk from "chalk";

export async function printVersion() {
  const result = shelljs.exec(`npm list -g sasjs-cli`, {
    silent: true
  });

  const line = result.split("\n").find(l => l.includes("sasjs-cli"));
  const version = line.split("@")[1].trim();
  if (version.includes("->")) {
    console.log(
      chalk.red(
        `You are using a linked version of SASjs CLI running from sources at ${chalk.cyanBright(
          version.replace("->", "").trim()
        )}`
      )
    );
  } else {
    console.log(
      chalk.greenBright(`You are using SASjs CLI v${chalk.cyanBright(version)}`)
    );
  }
}
