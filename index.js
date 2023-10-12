import { BulkGradeUpdater } from 'canvas-scripts';
import Grader from './Grader.js';
import fs from 'fs/promises';
import Zip from 'adm-zip';
import path from 'path';
import * as c from './ColorUtils.js';
import { fork } from 'child_process';

const canvasIdRegex = /^[^_]*?(?:_LATE|)_([0-9]+)/;

/**
 * @typedef AssignmentConfig
 * @property {boolean} [onlyCurrent] Only run the submission in the current_submission directory. Default is false.
 * @property {string} [startScript] The default start script to use if the student doesn't write one. Default is 'npm start'.
 * @property {boolean} [runStartScript] Specifies if the start script should be executed before running the test cases. Default is false.
 * @property {string[]} [requiredFiles] Names of all the files (including extensions) that must be present in the submission. Grading will fail if any are absent.
 * @property {boolean} [checkPackage] Specifies if the package.json file should be checked for existence and required properties. Default is true.
 */

/**
 * @typedef CanvasConfig
 * @property {string} apiKey The Canvas API key to use for grade uploads
 * @property {string|number} courseId The ID of the Canvas course that the assignment is a part of
 * @property {string|number} assignmentId The ID of the Canvas assignment
 * @property {boolean} [commentsAsFiles] If comments should be uploaded as files
 */

/**
 * Attempts to locate where the submission's CWD should be.
 * @param {string[]} [requiredFiles] Files required by the assignment
 */
async function findWorkingDirectory(requiredFiles) {
  let directory = null;
  const entries = await fs.readdir('./current_submission', {
    recursive: true,
    withFileTypes: true
  });
  for (const entry of entries) {
    if (entry.path.includes('node_modules')) continue;
    if (entry.name === 'package.json') {
      directory = entry.path;
      break;
    }
    if (requiredFiles && requiredFiles.includes(entry.name))
      directory = entry.path;
  }
  return directory || 'current_submission';
};

/**
 * Run the autograder.
 * @param {string} submissionsDir Directory containing all student submissions as zip files
 * @param {Grader} GraderClass Grader class, must override the one provided in this package
 * @param {AssignmentConfig} [assignmentConfig] Assignment-specific configuration
 * @param {CanvasConfig} [canvasConfig] Canvas credentials
 * @returns {void}
 */
async function autoGrade(submissionsDir, graderModule, assignmentConfig, canvasConfig) {
  graderModule = path.resolve(graderModule);
  if (assignmentConfig?.onlyCurrent) {
    const { grade, comments } = await new GraderClass(assignmentConfig).run();
    console.log('Score: ' + c.success(grade));
    console.log(c.error(comments));
    return;
  }
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
  for (const sub of subs.filter(file => file.endsWith('.zip'))) {
    const fileLoc = path.join(submissionsDir, sub);
    const subDir = path.join('current_submission', sub.substring(0, sub.length - 4));
    try {
      console.log(`Grading ${c.info(sub)}...`);
      await fs.rm('current_submission', { recursive: true, force: true });
      const zip = new Zip(fileLoc);
      zip.extractAllTo(subDir);
      const forkedGrader = fork(graderModule, {
        cwd: await findWorkingDirectory(assignmentConfig?.requiredFiles)
      });
      const results = await new Promise((resolve, reject) => {
        let m;
        forkedGrader.on('error', reject);
        forkedGrader.on('message', (message) => m = message);
        forkedGrader.send(assignmentConfig);
        forkedGrader.on('exit', () => resolve(m));
      });
      if (results.error) throw new Error(results.error);
      const { grade, comments } = results;
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
      console.error(c.error('Could not automatically grade submission.'));
      console.error(c.error(e));
    }
    console.log(c.warning('------------------------------'));
  }
  if (canvas && students.length) {
    await canvas.sendUpdate(canvasConfig.commentsAsFiles);
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
  Grader
};
