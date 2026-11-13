// 과제 제출에 붙는 첨부파일. Firebase Storage 에 올리고, 주소만 Firestore 에 담는다.
// 경로는 assignments/<과제 번호>/<올린 계정>/<묶음 번호>/<파일 이름> 이다.
// 묶음 번호를 브라우저에서 먼저 만들어 두면, 제출글을 한 번에 저장할 수 있다.

import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes
} from "firebase/storage";

import { storage } from "../firebase.js";

// 학교 시스템과 같은 기준으로 한 파일 30MB 까지 받는다.
export const MAX_FILE_BYTES = 30 * 1024 * 1024;
export const MAX_FILE_COUNT = 10;

export function createUploadId() {
  return crypto.randomUUID();
}

// 파일 이름에 경로 구분자나 제어 문자가 섞이지 않게 다듬는다.
function cleanFileName(name) {
  return String(name ?? "file")
    .replace(/[/\\]/g, "_")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, "")
    .slice(0, 120) || "file";
}

export function findOversizedFile(files) {
  return files.find((file) => file.size > MAX_FILE_BYTES) ?? null;
}

// 고른 파일들을 차례로 올리고, 저장해 둘 정보만 돌려준다.
// 도중에 실패하면 이미 올라간 파일을 지워서 찌꺼기를 남기지 않는다.
export async function uploadAttachments({
  assignmentId,
  uid,
  uploadId,
  files,
  onProgress
}) {
  const uploaded = [];

  try {
    for (const [index, file] of files.entries()) {
      onProgress?.(index, files.length, file.name);

      const path = `assignments/${assignmentId}/${uid}/${uploadId}`
        + `/${index}-${cleanFileName(file.name)}`;
      const fileRef = ref(storage, path);

      await uploadBytes(fileRef, file, { contentType: file.type || "application/octet-stream" });

      uploaded.push({
        name: cleanFileName(file.name),
        size: file.size,
        type: file.type || "",
        path,
        url: await getDownloadURL(fileRef)
      });
    }

    return uploaded;
  } catch (error) {
    await removeAttachments(uploaded);
    throw error;
  }
}

// 과제 자체에 붙는 첨부파일(제출글 첨부와 경로가 다르다).
// 경로는 assignmentFiles/<과제 번호>/<올린 계정>/<묶음 번호>/<파일 이름> 이다.
// 과제 문서를 만들기 전에 올리므로, 과제 번호는 화면에서 미리 만들어 둔 것을 쓴다.
export function validateAttachmentFiles(files, existingCount = 0) {
  if (existingCount + files.length > MAX_FILE_COUNT) {
    return `첨부는 최대 ${MAX_FILE_COUNT}개까지 올릴 수 있습니다.`;
  }

  const oversized = findOversizedFile(files);

  return oversized
    ? `'${oversized.name}' 은 ${formatFileSize(MAX_FILE_BYTES)} 를 넘습니다. 더 작은 파일을 올려주세요.`
    : "";
}

export async function uploadAssignmentFiles({ assignmentId, uid, files, onProgress }) {
  const uploadId = createUploadId();
  const uploaded = [];

  try {
    for (const [index, file] of files.entries()) {
      onProgress?.(index, files.length, file.name);

      const name = cleanFileName(file.name);
      const path = `assignmentFiles/${assignmentId}/${uid}/${uploadId}/${index}-${name}`;
      const fileRef = ref(storage, path);

      await uploadBytes(fileRef, file, { contentType: file.type || "application/octet-stream" });

      uploaded.push({
        name,
        size: file.size,
        type: file.type || "",
        path,
        url: await getDownloadURL(fileRef)
      });
    }

    return uploaded;
  } catch (error) {
    await removeAttachments(uploaded);
    throw error;
  }
}

export async function removeAttachments(attachments) {
  await Promise.all((attachments ?? []).map(async (attachment) => {
    try {
      await deleteObject(ref(storage, attachment.path));
    } catch (error) {
      // 이미 지워졌거나 권한이 없으면 그냥 넘어간다.
      console.error("첨부파일 삭제 오류:", error);
    }
  }));
}

export function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "0B";
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)}KB`;
  return `${(value / (1024 * 1024)).toFixed(1)}MB`;
}
