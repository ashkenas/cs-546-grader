import fs from 'fs/promises';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { deepStrictEqual } from 'assert';
import { pathToFileURL } from 'url';

const pretty = data => JSON.stringify(data, null, 2);

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
    this.directory = 'current_submission';
    this.author = 'NO AUTHOR';
    this.module = true;
    this.startScript = 'npm start';
    this.subprocess = null;
    this.score = 100;
    this.comments = [];
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
   * Import a javascript file from a relative location in the student
   * submission.
   * @param {string} file Relative file path from submission root
   * @returns {*}
   */
  async importFile(file) {
    const href = pathToFileURL(path.join(this.directory, file)).href;
    return await import(href);
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
      const filePath = path.join('current_submission', entry.path, entry.name);
      if (entry.name === 'package.json') {
        this.directory = path.join('current_submission', entry.path);
        this.packageJson = await import(filePath, { assert: { type: 'json' } });
        continue;
      }
      if (files[entry.name] !== undefined) {
        files[entry.name] = true;
        if (!this.packageJson) this.directory = entry.path;
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
    if (this.checkPackage) execSync('npm i', { cwd: this.directory });
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
