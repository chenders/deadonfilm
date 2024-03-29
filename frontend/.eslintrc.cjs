module.exports = {
  "root": true,
  "parserOptions": {
    "ecmaVersion": 2021,
    "sourceType": "module",
    "ecmaFeatures": {
      "jsx": true
    },
    "project": "./tsconfig.json"
  },
  "plugins": ["react", "react-hooks", "prettier", "import", "jsx-a11y"],
  "parser": "@typescript-eslint/parser",
  "extends": [
    "airbnb-typescript"
  ],
  "rules": {
    "prettier/prettier": ["error", {
      "printWidth": 120
    }],
    "quotes": 0,
    "@typescript-eslint/quotes": ["error", "double", { "avoidEscape": true, "allowTemplateLiterals": false }],
    "@typescript-eslint/comma-dangle": 0
  }
}
