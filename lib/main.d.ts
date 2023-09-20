/// <reference types="node/child_process" />
/// <reference types="node/ts4.8/child_process" />

export type AssignmentConfig = {
  /**
   * Only run the submission in the current_submission directory. Default is false.
   */
  onlyCurrent?: boolean;
  /**
   * The default start script to use if the student doesn't write one. Default is 'npm start'.
   */
  startScript?: string;
  /**
   * Specifies if the start script should be executed before running the test cases. Default is false.
   */
  runStartScript?: boolean;
  /**
   * Names of all the files (including extensions) that must be present in the submission. Grading will fail if any are absent.
   */
  requiredFiles?: string[];
  /**
   * Specifies if the package.json file should be checked for existence and required properties. Default is true.
   */
  checkPackage?: boolean;
};
export type CanvasConfig = {
  /**
   * The Canvas API key to use for grade uploads
   */
  apiKey: string;
  /**
   * The ID of the Canvas course that the assignment is a part of
   */
  courseId: string | number;
  /**
   * The ID of the Canvas assignment
   */
  assignmentId: string | number;
};
/**
* Run the autograder.
* @param {string} submissionsDir Directory containing all student submissions as zip files
* @param {Grader} GraderClass Grader class, must override the one provided in this package
* @param {AssignmentConfig} [assignmentConfig] Assignment-specific configuration
* @param {CanvasConfig} [canvasConfig] Canvas credentials
* @returns {void}
*/
export function autoGrade(submissionsDir: string, GraderClass: Grader, assignmentConfig?: AssignmentConfig, canvasConfig?: CanvasConfig): void;

/**
 * Do not instantiate this class. Extend it and implement
 * the testCases() method.
 */
export class Grader {
  constructor(assignmentConfig: any);
  requiredFiles: any;
  defaultStartScript: any;
  runStartScript: any;
  checkPackage: any;
  hadModules: boolean;
  directory: string;
  author: string;
  module: boolean;
  startScript: string;
  subprocess: import("node:child_process").ChildProcessWithoutNullStreams;
  score: number;
  comments: any[];
  /**
   * Deduct points from the student's grade.
   * @param {number} points Points to deduct
   * @param {string} reason Reason for deduction
   * @param {string} [error] Associated error message
   */
  deductPoints(points: number, reason: string, error?: string): void;
  /**
   * Run a deep equality assertion test case.
   * @param {number} points Points the test case is worth
   * @param {string} message Message to print before error text
   * @param {(()=>T)} testCase The test case, should return the same type as `expectedValue`
   * @param {T} expectedValue The anticipated result of `testCase`
   */
  assertDeepEquals(points: number, message: string, testCase: (() => T), expectedValue: T): Promise<void>;
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
  assertThrows(points: number, message: string, testCase: (() => T), expectedMessage?: string, messagePoints?: number, expectedType?: Error, typePoints?: number): Promise<void>;
  /**
   * Run a deep equality assertion test case with multiple acceptable outputs.
   * @param {number} points Points the test case is worth
   * @param {string} message Message to print before error text
   * @param {(()=>T)} testCase The test case, should return the same type as an `expectedValues` element
   * @param {T[]} expectedValues The anticipated result of `testCase`
   */
  assertDeepEqualsOptions(points: number, message: string, testCase: (() => T), expectedValues: T[]): Promise<void>;
  /**
   * Import a javascript file from a relative location in the student
   * submission.
   * @param {string} file Relative file path from submission root
   * @returns {*}
   */
  importFile(file: string): any;
  /**
   * Called internally by the grading framework.
   */
  start(): Promise<void>;
  /**
   * Called internally by the grading framework.
   */
  checks(): Promise<void>;
  /**
   * Override this with assignment-specific implementation.
   */
  testCases(): Promise<void>;
  /**
   * Called internally by the grading framework.
   */
  run(): Promise<{
      grade: number;
      comments: string;
  }>;
  /**
   * Called internally by the grading framework.
   */
  cleanup(): Promise<void>;
}
