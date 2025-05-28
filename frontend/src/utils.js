// Helper function to fetch an image URL and convert it to a File object
export async function urlToImageFile(url, filename, defaultMimeType = 'image/jpeg') {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch image from ${url}: ${response.statusText}`);
      return null;
    }
    const blob = await response.blob();
    // Ensure filename has an extension, otherwise File constructor might strip it or behave unexpectedly
    const finalFilename = filename || `image_from_url.${blob.type.split('/')[1] || defaultMimeType.split('/')[1]}`;
    return new File([blob], finalFilename, { type: blob.type || defaultMimeType });
  } catch (error) {
    console.error(`Error fetching or converting image from ${url}:`, error);
    return null;
  }
}
