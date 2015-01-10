# Quick `new.target` explainer

This design relies on the fact that [the recent ES6 subclassing changes](https://github.com/tc39/ecma262/blob/master/workingdocs/ES6-super-construct%3Dproposal.md) incorporate as a crucial ingredient a new parameter to the [\[Construct]] internal method, which is the "original constructor" or "new-target." In summary:

```js
class Base {
  constructor() {
    // not-quite-agreed-upon syntax for exposing the new-target
    console.log(new.target === Base);
    console.log(new.target === Derived);
  }
}

class Derived extends Base { }

new Base(); // true, false
new Derived(); // false, true
```
