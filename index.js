import { BulkGradeUpdater } from 'canvas-scripts';
import Grader, { stringify } from './Grader.js';
import fs from 'fs/promises';
import Zip from 'adm-zip';
import path from 'path';
import * as c from './ColorUtils.js';
import { FatalGraderError } from './Utils.js';

const canvasIdRegex = /^[^_]*?(?:_LATE|)_([0-9]+)/;

/**
 * @typedef AssignmentConfig
 * @property {boolean} [onlyCurrent] Only run the submission in the current_submission directory. Default is false.
 * @property {string} [startScript] The default start script to use if the student doesn't write one. Default is 'node app.js'.
 * @property {boolean} [runStartScript] Specifies if the start script should be executed before running the test cases. Default is false.
 * @property {string[]} [requiredFiles] Names of all the files (including extensions) that must be present in the submission. Grading will fail if any are absent.
 * @property {boolean} [checkPackage] Specifies if the package.json file should be checked for existence and required properties. Default is true.
 * @property {boolean} [hasDatabase] Whether or not to enable database grading features. Default is false.
 * @property {boolean} [connectionString] MongoDB connection string to use. Default is 'mongodb://localhost:27017/'.
 */

/**
 * @typedef CanvasConfig
 * @property {string} apiKey The Canvas API key to use for grade uploads
 * @property {string|number} courseId The ID of the Canvas course that the assignment is a part of
 * @property {string|number} assignmentId The ID of the Canvas assignment
 */

/**
 * Run the autograder.
 * @param {string} submissionsDir Directory containing all student submissions as zip files
 * @param {Grader} GraderClass Grader class, must override the one provided in this package
 * @param {AssignmentConfig} [assignmentConfig] Assignment-specific configuration
 * @param {CanvasConfig} [canvasConfig] Canvas credentials
 * @returns {void}
 */
async function autoGrade(submissionsDir, GraderClass, assignmentConfig, canvasConfig) {
  if (assignmentConfig?.onlyCurrent) {
    const { grade, comments } = await new GraderClass(assignmentConfig).run();
    console.log('Score: ' + c.success(grade));
    console.log(c.error(comments));
    return;
  }
  if (assignmentConfig.runStartScript && !assignmentConfig.startScript)
    console.log(c.warning("Using default start script 'node app.js'"));
  const canvas = canvasConfig ?
    await new BulkGradeUpdater().setParameters(
      canvasConfig.apiKey,
      canvasConfig.courseId,
      canvasConfig.assignmentId
    ) : null;
  try {
    // Confirms access to submissionsDir
    await fs.access(submissionsDir);
  } catch {
    throw new Error('Submissions directory is inaccessible or does not exist');
  }
  const students = [];
  const subs = await fs.readdir(submissionsDir);
  const originalDir = process.cwd();
  for (const sub of subs.filter(file => file.endsWith('.zip'))) {
    const fileLoc = path.join(submissionsDir, sub);
    const subDir = path.join('current_submission', sub.substring(0, sub.length - 4));
    let grader = null;
    try {
      process.chdir(originalDir);
      console.log(`Grading ${c.info(sub)}...`);
      await fs.rm('current_submission', { recursive: true, force: true });
      const zip = new Zip(fileLoc);
      zip.extractAllTo(subDir);
      grader = new GraderClass(assignmentConfig);
      const { grade, comments } = await grader.run();
      console.log(`Done. Scored ${c.success(grade)}`);
      if (!canvas) console.log(c.error(comments));
      else {
        if (canvasIdRegex.test(sub)) {
          const studentId = canvasIdRegex.exec(sub)[1];
          canvas.addStudent(studentId, grade, comments);
          students.push([grader.author, sub]);
        } else {
          console.error(c.error('Failed to locate student canvas ID for submission. Upload comments manually:'));
          console.log(c.error(comments || 'No comments.'));
        }
      }
    } catch (e) {
      await grader?.cleanup();
      if (e instanceof FatalGraderError) {
        console.error(c.error('Encountered an error that would interfere'
          + ' with the grading of further submissions. Aborting grader at this point.'));
        console.error(c.error(e.toString()));
        break;
      } else {
        console.error(c.error('Could not automatically grade submission.'));
        console.error(c.error(e.stack));
      }
    }
    console.log(c.warning('------------------------------'));
  }
  if (canvas && students.length) {
    process.chdir(originalDir);
    await canvas.sendUpdate(assignmentConfig?.commentsAsFiles);
    console.log(c.success('Uploaded grades for the following students:'));
    const uploadedDir = path.join(submissionsDir, 'uploaded');
    await fs.mkdir(uploadedDir, { recursive: true });
    for (const student of students) {
      console.log('  - ' + student[0]);
      await fs.rename(
        path.join(submissionsDir, student[1]),
        path.join(uploadedDir, student[1])
      );
    }
  } else {
    console.log(c.warning('No grades uploaded.'));
  }
};

export {
  autoGrade,
  Grader,
  stringify
};
