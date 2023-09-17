import { BulkGradeUpdater } from 'canvas-scripts';
import Grader from 'Grader';
import fs from 'fs/promises';
import Zip from 'adm-zip';
import path from 'path';

const canvasIdRegex = /^[^_]*?(?:_LATE|)_([0-9]+)/;

async function autoGrade(submissionsDir, assignmentConfig, GraderClass, canvasConfig) {
  if (assignmentConfig?.onlyCurrent) {
    const { grade, comments } = await new GraderClass(assignmentConfig).run();
    console.log(`Score: ${grade}`);
    console.error(comments);
    return;
  }
  const canvas = canvasConfig ?
    await new BulkGradeUpdater().setParameters(
      canvasConfig.apiKey,
      canvasConfig.courseId,
      canvasConfig.assignmentId
    ) : null;
  await fs.access(submissionsDir); // Confirms access to submissionsDir
  const students = [];
  const subs = await fs.readdir(submissionsDir);
  for (const sub of subs.filter(file => file.endsWith('.zip'))) {
    const fileLoc = path.join(submissionsDir, sub);
    try {
      await fs.rm('current_submission', { recursive: true, force: true });
      const zip = new Zip(fileLoc);
      zip.extractAllTo('current_submission');
      const grader = new GraderClass(assignmentConfig);
      const { grade, comments } = await grader.run();
      console.log(`Graded ${sub}. Score: ${grade}`);
      if (!canvas) console.error(comments);
      else {
        if (canvasIdRegex.test(sub)) {
          const studentId = canvasIdRegex.exec(sub)[1];
          canvas.addStudent(studentId, grade, comments);
          students.push([grader.author, sub]);
        } else {
          console.error('Failed to locate student canvas ID for submission. Upload comments manually:');
          console.error(comments || 'No comments.');
        }
      }
    } catch (e) {
      console.error(e);
      console.error(`Could not automatically grade submission '${sub}'.`);
    }
  }
  if (canvas && students.length) {
    await canvas.sendUpdate();
    console.log('Uploaded grades for the following students:');
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
    console.log('No grades uploaded.');
  }
};

export {
  autoGrade,
  Grader
};