import { removeComments } from "../src/utils/utils";
import { sampleSasProgram } from "./sample-sas";

describe("removeComments", () => {
  test("should remove block comment", () => {
    const text = `/* test\n123\n456\n789 */`;
    expect(removeComments(text)).toEqual("");
  });

  test("should not remove single line block comment", () => {
    const text = `/* test */`;
    expect(removeComments(text)).toEqual(text);
  });

  test("should remove all comments from the provided SAS file", () => {
    const expected = `%macro mv_createfolder(path=
,access_token_var=ACCESS_TOKEN
,grant_type=authorization_code
);`;
    expect(removeComments(sampleSasProgram)).toEqual(expected);
  });

  test("should keep inline comments intact when they start a line", () => {
    const text = "/* Some Comment */ CODE HERE;";
    expect(removeComments(text)).toEqual(text);
  });

  test("should keep inline comments intact when they are within a line", () => {
    const text = "CODE HERE /* Some Comment  */";
    expect(removeComments(text)).toEqual(text);
  });
});
