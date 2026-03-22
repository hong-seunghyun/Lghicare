module.exports = {
    root: true,
    parser: "@typescript-eslint/parser",
    plugins: ["@typescript-eslint"],
    extends: [
        "next",
        "next/core-web-vitals",
        "plugin:@typescript-eslint/recommended",
    ],
    rules: {
        //  any 허용
        "@typescript-eslint/no-explicit-any": "off",
    },
};
