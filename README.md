# Element constructors speculative design

This is an approach to showing how to do the constructor hierarchy for HTML elements, while maintaining a number of invariants.

_Terminology: In what follows I use "own-instances of `X`" to mean objects where `obj.constructor === X`, as distance from "instances of `X`" which means objects for which `obj instanceof X`._

These are the invariants we've written down so far that we are trying to preserve from the existing platform:

1.  The localName and namespace of an element determine its set of internal slots.

2.  The return value of `new Foo` has `Foo.prototype` as the prototype.

3. Elements whose (localName, namespace) pair matches an entry in the conceptual (localName, namespace) → constructor registry, never appear except as own-instances of the constructor given by their entry in the registry.

   This allows us to rephrase 1 to the equivalent "the constructor of an element determines its set of internal slots," which makes sense given how in ES6 constructors are responsible for allocating and assigning any internal state.

4. Elements whose namespace is the HTML namespace must be instances of `HTMLElement`.

5. Elements in the HTML namespace which do not appear in the list of HTML tag names (including possibly-registered custom elements) must be own-instances of `HTMLUnknownElement`.

We also have the following requirements written down so far, with probably many more latent in the design:

1. Any object which could be produced by the HTML parser (or other APIs, but usually the parser is the most lenient) must be able to be produced with the relevant constructor. (If this requirement is in conflict with any of 1-5, please let me know!) An example of this would be that you must be able to create an Element with local name `` a` `` via the `HTMLUnknownElement` constructor, since such an element comes into being via `` document.body.innerHTML = "<a`>foo</a`>" ``.
