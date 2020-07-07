import prompt from "prompt";

export async function getUserInput(fields) {
  prompt.message = "";
  prompt.start();
  return new Promise((resolve, reject) => {
    prompt.get(fields, (error, result) => {
      if (error) {
        reject(error);
      }
      resolve(result);
    });
  });
}
