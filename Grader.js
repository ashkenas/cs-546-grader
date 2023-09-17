import fs from 'fs/promises';
import path from 'path';

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
    this.score = 100;
    this.comments = [];
  }

  /**
   * Deduct points from the student's grade.
   * @param {number} points Points to deduct
   * @param {string} reason Reason for deduction
   * @param {string} error Optional associated error message
   */
  deductPoints(points, reason, error = null) {
    this.score -= points;
    if (score < 0) score = 0;
    this.comments.push(`${points}; ${reason}${error ? '\n' + error.toString() : ''}`);
  }

  // TODO: file import function (not module specific)

  async runStartScript() {
    // TODO: run start script or default
  }
  
  async checks() {
    // TODO: get directory
    // TODO: check for package.json
    // TODO: get module type (this.module)
    // TODO: get student name (this.author)
    // TODO: check for start script
    // TODO: check required files
    // TODO: check for node_modules, this.hadModules = true
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
  }
};
