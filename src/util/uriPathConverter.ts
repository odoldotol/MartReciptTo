export default {

    toPath: function(imageUri: string) {
        return imageUri.replace(/\//g, '\\')
    },

    toUri: function(imagePath: string) {
        return imagePath.replace(/\\/g, '/')
    },

};
