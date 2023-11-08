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
   * Names of all the collections that must be present in the database. Grading will fail if any are absent.
   */
  requiredCollections?: string[];
  /**
   * Specifies if the package.json file should be checked for existence and required properties. Default is true.
   */
  checkPackage?: boolean;
  /**
   * Whether or not to enable database grading features. Default is false.
   */
  hasDatabase?: boolean;
  /**
   * MongoDB connection string. Default is 'mongodb://localhost:27017/'.
   */
  connectionString?: string;
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
export type Verb = 'GET'|'POST'|'PATCH'|'PUT'|'DELETE';
/**
* Run the autograder.
* @param {string} submissionsDir Directory containing all student submissions as zip files
* @param {Grader} GraderClass Grader class, must override the one provided in this package
* @param {AssignmentConfig} [assignmentConfig] Assignment-specific configuration
* @param {CanvasConfig} [canvasConfig] Canvas credentials
* @returns {void}
*/
export function autoGrade(submissionsDir: string, GraderClass: Grader, assignmentConfig?: AssignmentConfig, canvasConfig?: CanvasConfig): Promise<void>;

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
  packageJson: any;
  hadModules: boolean;
  directory: string;
  author: string;
  module: boolean;
  startScript: string;
  subprocess: import("node:child_process").ChildProcessWithoutNullStreams;
  score: number;
  comments: any[];
  db: import("mongodb").Db;
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
  assertDeepEquals<T>(points: number, message: string, testCase: (() => T), expectedValue: T): Promise<void>;
  /**
   * Asserts that a test case throws an error. Optionally a specific
   * error message and error type can be specified.
   * @param {number} points Points the test case is worth
   * @param {string} message Message to print before error text
   * @param {(()=>any)} testCase The test case, should throw the same type `expectedType`
   * @param {string} [expectedMessage] Optional specific error message
   * @param {number} [messagePoints] Points to deduct for an incorrect error message
   * @param {Error} [expectedType] Optional specific error type
   * @param {number} [typePoints] Points to deduct for an incorrect error type
   */
  assertThrows(points: number, message: string, testCase: (() => any), expectedMessage?: string, messagePoints?: number, expectedType?: Error, typePoints?: number): Promise<void>;
  /**
   * Run a deep equality assertion test case with multiple acceptable outputs.
   * @param {number} points Points the test case is worth
   * @param {string} message Message to print before error text
   * @param {(()=>T)} testCase The test case, should return the same type as an `expectedValues` element
   * @param {T[]} expectedValues An array of all possible anticipated results of `testCase`
   */
  assertDeepEqualsOptions<T>(points: number, message: string, testCase: (() => T), expectedValues: T[]): Promise<void>;
  /**
   * Make a request and get the response status and body.
   * @param {string} url The URL to make a request to
   * @param {Verb} [method] Request method to use (default 'GET')
   * @param {any} [body] Request body (automatically stringified if necessary)
   */
  request(url: string, method: Verb, body: any): Promise<[number, string]>;
  /**
   * Asserts that a response is ok (status 200) and has the specified body.
   * @param {number} points Points the test case is worth
   * @param {string} url URL to request
   * @param {Verb} method Request method to use 
   * @param {any} body Request body (stringified automatically if needed)
   * @param {any} expectedValue Expected response body (can be any type)
   */
  assertRequestDeepEquals(points: number, url: string, method: Verb, body: any, expectedValue: any): Promise<void>;
  /**
   * Asserts that a response is ok (status 200) and has the specified body.
   * Ignores the `_id` key while checking equality, then returns the value
   * of it.
   * @param {number} points Points the test case is worth
   * @param {string} url URL to request
   * @param {Verb} method Request method to use 
   * @param {any} body Request body (stringified automatically if needed)
   * @param {any} expectedValue Expected response body (can be any type)
   * @return The value of the `_id` property
   */
  assertRequestDeepEqualsWithoutId(points: number, url: string, method: Verb, body: any, expectedValue: any): Promise<string>;
  /**
   * Asserts that a request response has a certain status code.
   * @param {number} points Points the test case is worth
   * @param {string} url URL to request
   * @param {Verb} method Request method to use 
   * @param {any} body Request body (stringified automatically if needed)
   * @param {number} expectedStatus Status code that response should have
   */
  assertRequestStatus(points: number, url: string, method: Verb, body: any, expectedStatus: number): Promise<void>;
  /**
   * Runs a provided assertion, removing the _id attribute from the result
   * of `testCase()` first and then returning it after the assertion completes.
   * @param {number} points Points the test case is worth.
   * @param {string} message Message to print before error text.
   * @param {any} testCase Test case to post-process.
   * @param {any} expectedValue Expected value(s) to pass to the assertion
   * @param {any} assertion 
   * @returns {Promise<string>} The _id field from `testCase()`
   */
  assertWithoutId(points: number, message: string, testCase: any, expectedValue: any, assertion: any): Promise<string>;
  /**
   * Builds a file URL from a relative file path for a file in a submission
   * @param {string} relativeFile Relative file path from submission root
   * @param {boolean} url Whether the returned path should be a URL
   * @param {boolean} [oneTime] Generate a fresh cache parameter for invalidation
   */
  buildAbsoluteFilePath(relativeFile: string, url: boolean, oneTime?: boolean): string;
  /**
   * Import a JSON file from a relative location in the student submission.
   * @param {string} relativePath Relative file path from submission root
   */
  importJSON(relativePath: string): Promise<any>;
  /**
   * Import a javascript file from a relative location in the student submission.
   * @param {string} relativePath Relative file path from submission root
   * @param {boolean} [oneTime] Bypasses the cache and does a fresh import
   */
  importFile(relativePath: string, oneTime?: boolean): Promise<any>;
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

/**
 * Take in an object and stringifies it. Uses special notation
 * to reveal unprocessed ObjectIds.
 * @param obj Object to stringify
 */
export function stringify(obj: any): string;