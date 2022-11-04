export default {

    toPath(imageUri: string) {
        return imageUri.replace(/\//g, '\\')
    },

    toUri(imagePath: string) {
        return imagePath.replace(/\\/g, '/')
    },

};
