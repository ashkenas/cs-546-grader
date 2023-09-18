import fs from 'fs/promises';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { deepStrictEqual } from 'assert';

/**
 * Do not instantiate this class. Extend it and implement
 * the testCases() method.
 */
export default class Grader {
  constructor(assignmentConfig) {
    this.assignmentConfig = assignmentConfig || {};
    this.hadModules = false;
    this.directory = 'current_submission';
    this.author = 'NO AUTHOR';
    this.module = true;
    this.start = 'npm start';
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
    if (score < 0) score = 0;
    this.comments.push(`-${points}; ${reason}${error ? '\n' + error.toString() : ''}`);
  }

  /**
   * Run a deep equality assertion test case.
   * @param {number} points Points the test case is worth
   * @param {(()=>T)} testCase The test case, should return the same type as `expectedValue`
   * @param {T} expectedValue The anticipated result of `testCase`
   */
  async assertDeepEquals(points, testCase, expectedValue) {
    let actual;
    try {
      actual = await testCase();
    } catch (e) {
      this.deductPoints(points, 'Error thrown on valid input.', e.toString());
      return;
    }

    try {
      deepStrictEqual(actual, expectedValue, 'Expected strict deep equality');
    } catch (e) {
      this.deductPoints(points, 'Unexpected results.', e.toString());
    }
  }

  /**
   * Asserts that a test case throws an error. Optionally a specific
   * error message and error type can be specified.
   * @param {number} points Points the test case is worth
   * @param {(()=>T)} testCase The test case, should throw the same type `
   * @param {string} [expectedMessage] Optional specific error message
   * @param {number} [messagePoints] Points to deduct for an incorrect error message
   * @param {Error} [expectedType] Optional specific error type
   * @param {number} [typePoints] Points to deduct for an incorrect error type
   */
  async assertThrows(points, testCase, expectedMessage, messagePoints, expectedType, typePoints) {
    if (expectedMessage && typeof messagePoints !== 'number')
      throw new TypeError('If expectedMessage is provided, messagePoints must be provided as well.');
    if (expectedType && typeof typePoints !== 'number')
      throw new TypeError('If expectedType is provided, typePoints must be provided as well.');
    try {
      const result = await testCase();
      this.deductPoints(points, 'Expected an error to be thrown, got a result instead.', result);
    } catch (e) {
      if (!expectedMessage && !expectedType) return;
      let deducted = 0;
      if (expectedMessage) {
        const message = typeof e === 'string' ? e : e.message;
        if (message.trim() !== expectedMessage.trim()) {
          this.deductPoints(messagePoints, 'Encountered unexpected error message.',
            `- Expected: ${expectedMessage}\n- Received: ${message}`);
          deducted = messagePoints;
        }
      }
      if (expectedType && !(e instanceof expectedType)) {
        // Prevent cumulative deductions from going above
        // the total test case points
        if (typePoints + deducted > points)
          typePoints -= points - deducted;
        this.deductPoints(typePoints, 'Encountered unexpected error type.',
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
    return await import(path.join(this.directory, file));
  }

  async runStartScript() {
    const cmd = this.start.split(' ');
    if (!cmd[0] || cmd[0] !== 'node')
      throw new Error('Possibly unsafe start script encountered: ' + this.start);
    this.subprocess = spawn(cmd[0], cmd.slice(1), {
      cwd: this.directory
    });
  }
  
  async checks() {
    let package = null;
    const requiredFiles = Object.fromEntries(
      (this.assignmentConfig.requiredFiles || []).map(file => [file, false])
    );
    const entries = await fs.readdir(current, {
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
        package = await import(filePath, { assert: { type: 'json' } });
        continue;
      }
      if (requiredFiles[entry.name] !== undefined) {
        requiredFiles[entry.name] = true;
        if (!package) this.directory = entry.path;
      }
    }
    if (!package) {
      this.deductPoints(5, 'Missing package.json file.');
      if (!this.assignmentConfig?.startScript)
        throw new Error('Student did not provide start script and no default was provided.');
      this.start = this.assignmentConfig.startScript;
    } else {
      if (!package.type || package.type !== 'module')
        this.module = false;
      if (package.author) this.author = package.author;
      if (!package.scripts || !package.scripts.start) {
        this.deductPoints(5, 'Missing start script in package.json file.');
        if (!this.assignmentConfig.startScript)
          throw new Error('Student did not provide start script and no default was provided.');
        this.start = this.assignmentConfig.startScript;
      }
    }
    const missingFiles = requiredFiles.entries()
      .filter(([_, found]) => found)
      .map(([file, _]) => file)
      .join(', ');
    if (missingFiles) throw new Error('Missing file(s): ' + missingFiles);
    execSync('npm i', { cwd: this.directory });
  }

  async run() {
    if (!this.testCases)
      throw new Error('Please implement testCases() with appropriate test cases for the assignment.');
    await this.checks();
    if (this.assignmentConfig.runStartScript)
      await this.runStartScript();
    await this.testCases();
    await this.cleanup();
    return {
      grade: this.score,
      comments: this.comments.join('\n')
    };
  }

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
