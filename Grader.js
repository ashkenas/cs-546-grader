import fs from 'fs/promises';
import path from 'path';
import { spawn, exec } from 'child_process';
import { deepStrictEqual } from 'assert';
import { pathToFileURL } from 'url';

const pretty = data => JSON.stringify(data, null, 2);
const uid = (() => {
  let id = 0;
  return () => id++;
})();

/**
 * Do not instantiate this class. Extend it and implement
 * the testCases() method.
 */
export default class Grader {
  constructor(assignmentConfig) {
    assignmentConfig = assignmentConfig || {};
    this.requiredFiles = assignmentConfig.requiredFiles || [];
    this.defaultStartScript = assignmentConfig.startScript || null;
    this.runStartScript = assignmentConfig.runStartScript || false;
    this.checkPackage = assignmentConfig.checkPackage ?? true;
    this.packageJson = null;
    this.hadModules = false;
    this.directory = process.cwd();
    this.author = '';
    this.module = true;
    this.startScript = 'node app.js';
    this.subprocess = null;
    this.score = 100;
    this.comments = [];
  }

  /**
   * Run grading in forked subprocess
   */
  static pipe() {
    process.on('message', async (message) => {
      try {
        process.send(await (new this(message)).run())
        process.exit(0);
      } catch (e) {
        process.send({
          error: e.message || e
        });
        process.exit(1);
      }
    });
  }

  /**
   * Deduct points from the student's grade.
   * @param {number} points Points to deduct
   * @param {string} reason Reason for deduction
   * @param {string} [error] Associated error message
   */
  deductPoints(points, reason, error) {
    this.score -= points;
    if (this.score < 0) this.score = 0;
    this.comments.push(`-${points}; ${reason}${error ? '\n' + error.toString() : ''}`);
  }

  /**
   * Run a deep equality assertion test case.
   * @param {number} points Points the test case is worth
   * @param {string} message Message to print before error text
   * @param {(()=>T)} testCase The test case, should return the same type as `expectedValue`
   * @param {T} expectedValue The anticipated result of `testCase`
   */
  async assertDeepEquals(points, message, testCase, expectedValue) {
    let actual;
    try {
      actual = await testCase();
    } catch (e) {
      this.deductPoints(points, `${message}; Error thrown on valid input.`, e.toString());
      return;
    }

    try {
      deepStrictEqual(actual, expectedValue, 'Expected strict deep equality');
    } catch (e) {
      this.deductPoints(points, `${message}; Unexpected results.`,
        `Received: ${pretty(actual)}\nExpected: ${pretty(expectedValue)}`);
    }
  }

  /**
   * Run a deep equality assertion test case with multiple acceptable outputs.
   * @param {number} points Points the test case is worth
   * @param {string} message Message to print before error text
   * @param {(()=>T)} testCase The test case, should return the same type as an `expectedValues` element
   * @param {T[]} expectedValues An array of all possible anticipated results of `testCase`
   */
  async assertDeepEqualsOptions(points, message, testCase, expectedValues) {
    let actual;
    try {
      actual = await testCase();
    } catch (e) {
      this.deductPoints(points, `${message}; Error thrown on valid input.`, e.toString());
      return;
    }

    for (const expectedValue of expectedValues) {
      try {
        deepStrictEqual(actual, expectedValue);
        return;
      } catch {}
    }
    this.deductPoints(points, `${message}; Unexpected results.`,
      `Received: ${pretty(actual)}\nExpected one of the following:\n- ` +
      expectedValues.map(pretty).join('\n- '));
  }

  /**
   * Asserts that a test case throws an error. Optionally a specific
   * error message and error type can be specified.
   * @param {number} points Points the test case is worth
   * @param {string} message Message to print before error text
   * @param {(()=>T)} testCase The test case, should throw the same type `expectedType`
   * @param {string} [expectedMessage] Optional specific error message
   * @param {number} [messagePoints] Points to deduct for an incorrect error message
   * @param {Error} [expectedType] Optional specific error type
   * @param {number} [typePoints] Points to deduct for an incorrect error type
   */
  async assertThrows(points, message, testCase, expectedMessage, messagePoints, expectedType, typePoints) {
    if (expectedMessage && typeof messagePoints !== 'number')
      throw new TypeError('If expectedMessage is provided, messagePoints must be provided as well.');
    if (expectedType && typeof typePoints !== 'number')
      throw new TypeError('If expectedType is provided, typePoints must be provided as well.');
    try {
      const result = await testCase();
      this.deductPoints(
        points,
        `${message}; Expected an error to be thrown, got a result instead.`,
        pretty(result)
      );
    } catch (e) {
      if (!expectedMessage && !expectedType) return;
      let deducted = 0;
      if (expectedMessage) {
        const errorMessage = typeof e === 'string' ? e : e.message;
        if (errorMessage.trim() !== expectedMessage.trim()) {
          this.deductPoints(messagePoints, `${message}; Encountered unexpected error message.`,
            `- Expected: ${expectedMessage}\n- Received: ${errorMessage}`);
          deducted = messagePoints;
        }
      }
      if (expectedType && !(e instanceof expectedType)) {
        // Prevent cumulative deductions from going above
        // the total test case points
        if (typePoints + deducted > points)
          typePoints -= points - deducted;
        this.deductPoints(typePoints, `${message}; Encountered unexpected error type.`,
          `- Expected: ${expectedType.name || (typeof expectedType)}\n- Received: ${e.name || (typeof e)}`);
      }
    }
  }

  /**
   * Builds a file URL from a relative file path for a file in a submission
   * @param {string} relativeFile Relative file path from submission root
   * @param {boolean} url Whether the returned path should be a URL
   */
  buildAbsoluteFilePath(relativeFile, url) {
    const absolutePath = path.resolve(path.join(this.directory, relativeFile));
    if (!url) return absolutePath;
    const href = pathToFileURL(absolutePath).href;
    return `${href}?invalidateCache=${uid()}`;
  }

  /**
   * Import a JSON file from a relative location in the student submission.
   * @param {string} relativePath Relative file path from submission root
   * @returns {Promise<*>}
   */
  async importJSON(relativePath) {
    try {
      return JSON.parse(
        await fs.readFile(
          this.buildAbsoluteFilePath(relativePath, false), {
            encoding: 'utf8'
          }
        )
      );
    } catch (e) {
      if (e instanceof SyntaxError)
        throw `Malformed JSON syntax in '${relativePath}'`;
      throw e;
    }
  }

  /**
   * Import a javascript file from a relative location in the student submission.
   * @param {string} relativePath Relative file path from submission root
   * @returns {Promise<*>}
   */
  async importFile(relativePath) {
    let file;// = await import(this.buildAbsoluteFilePath(relativePath, true))
    let lastDep;
    while (!file) {
      try {
        file = await import(this.buildAbsoluteFilePath(relativePath, true))
      } catch (e) {
        if (typeof e !== 'object' || e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
        const [, dependency] =
          e.message.match(/Cannot find package '(.*)' imported from/);
        if (lastDep === dependency)
          throw new Error(`Couldn't automatically install dependency: '${dependency}'`);
        lastDep = dependency;
        if ((/[^a-z:_@\-]/).test(dependency))
          throw new Error(`Invalid missing package imported: '${dependency}'`);
        await new Promise((resolve, reject) => {
          exec(`npm i ${dependency}`, {
            cwd: this.directory
          }, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
        this.deductPoints(5, `Dependency '${dependency}' missing from package.json.`);
      }
    }
    return file.default ? file.default : file;
  }

  /**
   * Called internally by the grading framework.
   */
  async start() {
    const cmd = this.startScript.split(' ');
    if (!cmd[0] || cmd[0] !== 'node')
      throw new Error('Possibly unsafe start script encountered: ' + this.startScript);
    this.subprocess = spawn(cmd[0], cmd.slice(1), {
      cwd: this.directory
    });
  }
  
  /**
   * Called internally by the grading framework.
   */
  async checks() {
    const files = Object.fromEntries(
      this.requiredFiles.map(file => [file, false])
    );
    const entries = await fs.readdir(this.directory, {
      recursive: true,
      withFileTypes: true
    });
    for (const entry of entries) {
      if (!this.hadModules && entry.isDirectory() && entry.name == 'node_modules') {
        this.hadModules = true;
        this.deductPoints(5, 'Included node_modules in submission.');
        continue;
      }
      if (this.hadModules && entry.path.includes('node_modules')) continue;
      if (entry.name.toLowerCase() === 'package.json') {
        this.packageJson = await this.importJSON('package.json');
        continue;
      }
      if (files[entry.name] !== undefined) {
        files[entry.name] = true;
      }
    }
    if (this.checkPackage) {
      if (!this.packageJson) {
        this.deductPoints(5, 'Missing package.json file.');
        if (!this.defaultStartScript && this.runStartScript)
          throw new Error('Student did not provide start script and no default was provided.');
        this.startScript = this.defaultStartScript;
      } else {
        if (!this.packageJson.type || this.packageJson.type !== 'module')
          this.module = false;
        if (this.packageJson.author) this.author = this.packageJson.author;
        if (!this.packageJson.scripts || !this.packageJson.scripts.start) {
          console.log(this.packageJson);
          this.deductPoints(5, 'Missing start script in package.json file.');
          if (!this.defaultStartScript && this.runStartScript)
            throw new Error('Student did not provide start script and no default was provided.');
          this.startScript = this.defaultStartScript;
        }
      }
    }
    const missingFiles = Object.entries(files)
      .filter(([_, found]) => !found)
      .map(([file, _]) => file)
      .join(', ');
    if (missingFiles) throw new Error('Missing file(s): ' + missingFiles);
    if (this.packageJson && this.packageJson.dependencies) {
      await new Promise((resolve, reject) => {
        exec('npm i'/*, { cwd: this.directory }*/, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }
  }

  /**
   * Override this with assignment-specific implementation.
   */
  async testCases() {
    throw new Error('Please implement testCases() with appropriate test cases for the assignment.');
  }

  /**
   * Called internally by the grading framework.
   */
  async run() {
    await this.checks();
    if (this.runStartScript)
      await this.start();
    await this.testCases();
    await this.cleanup();
    return {
      grade: this.score,
      comments: this.comments.join('\n')
    };
  }

  /**
   * Called internally by the grading framework.
   */
  async cleanup() {
    if (!this.hadModules) {
      await fs.rm(path.join(this.directory, 'node_modules'), {
        recursive: true,
        force: true
      });
    }
    if (this.subprocess)
      if (!this.subprocess.kill())
        console.warn('Failed to kill student submission process.');
  }
};
