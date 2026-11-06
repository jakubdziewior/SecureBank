import { Camera, PermissionResponse } from 'expo-camera';

export type CameraAccess = 'granted' | 'undetermined' | 'denied' | 'permanentlyDenied' | 'unavailable';

const LOG_TAG = '[SecureBank/CameraPermission]';

const toAccess = (response: PermissionResponse): CameraAccess => {
  if (response.granted) return 'granted';
  if (response.status === 'undetermined') return 'undetermined';
  return response.canAskAgain ? 'denied' : 'permanentlyDenied';
};

export const logCameraAccess = (source: string, access: CameraAccess) => {
  console.info(`${LOG_TAG} source=${source} status=${access}`);
};

export const getCameraAccess = async (): Promise<CameraAccess> => {
  try {
    return toAccess(await Camera.getCameraPermissionsAsync());
  } catch {
    return 'unavailable';
  }
};

export const requestCameraAccess = async (): Promise<CameraAccess> => {
  const current = await getCameraAccess();
  if (current !== 'undetermined' && current !== 'denied') {
    return current;
  }
  try {
    return toAccess(await Camera.requestCameraPermissionsAsync());
  } catch {
    return 'unavailable';
  }
};
