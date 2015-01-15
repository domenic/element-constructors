class ElementConstructorRegistry {
  getConstructor(localName, namespace) {
    // Returns the registered constructor if one exists.
    // Otherwise if the namespace is HTML_NS, returns HTMLUnknownElement.
    // Otherwise returns Element.
  }
  getNames(Constructor) {
    // Returns an array of { localName, namespace } objects that have been explicitly registered in the registry.
    // (Notably, HTMLUnknownElement and Element do not count as explicitly registered, so getNames given those should
    // always return an empty array.)
  }
  set(localName, namespace, constructor) { ... }
  has(localname, namespace) { ... }
}

const elementConstructorRegistry = new ElementConstructorRegistry();
// Register all the elements from all the specs ever here.
// E.g.:
elementConstructorRegistry.set("p", HTML_NS, HTMLParagraphElement);
elementConstructorRegistry.set("q", HTML_NS, HTMLQuoteElement);
elementConstructorRegistry.set("blockquote", HTML_NS, HTMLQuoteElement);
elementConstructorRegistry.set("section", HTML_NS, HTMLElement);
elementConstructorRegistry.set("aside", HTML_NS, HTMLElement);
// ...

assert(/* no entries in the registry have namespace HTML_NS that are not === HTMLElement or instanceof HTMLElement */);

class Element extends Node {
  constructor({ localName = undefined, namespace = null, prefix = null,
              document = GetFunctionRealm(new.target)@[[globalThis]].document } = {}) {
    // TODO: gotta call super() to allocate a Node, but I didn't take the time to specify the Node constructor.
    // Node wants a base URL, which might be derivable from the document or might not; see
    // https://github.com/domenic/element-constructors/issues/4. If it is not derivable, then we need to add another
    // option (here and in derived classes).

    if (!brandCheck(document, Document)) {
      throw new TypeError("The document argument is required and must be a Document");
    }

    if (localName === undefined) {
      // In this case we are probably being constructed via a `super()` call inside a derived constructor.
      // So we can try to look up the appropriate local name and namespace from the registry.
      if (namespace !== null) {
        throw new TypeError("If localName is not supplied, then namespace should not be supplied");
      }

      const nameStuff = elementConstructorRegistry.getNames(new.target);
      if (nameStuff.length === 0) {
        throw new TypeError(`The constructor ${new.target.name} has not been registered as an element constructor`);
      }
      if (nameStuff.length > 1) {
        throw new TypeError(`The constructor ${new.target.name} has been registered for multiple (local name, ` +
          `namespace) pairs, and so the correct one cannot be inferred automatically.`);
      }
      { localName, namespace } = nameStuff[0];
    } else {
      localName = ToString(localName);
      namespace = namespace !== null ? ToString(namespace) : namespace;
      if (namespace === "") {
        namespace = null;
      }

      const Constructor = elementConstructorRegistry.getConstructor(localName, namespace);
      if (Constructor !== new.target) {
        throw new TypeError(`The ${new.target.name} constructor cannot be used to create elements with local name ` +
          `"${localName}" and namespace "${namespace}". Use the ${Constructor.name} constructor instead.`);
      }
    }

    prefix = prefix !== null ? ToString(prefix) : prefix;

    // Maintain the invariants of https://dom.spec.whatwg.org/#validate-and-extract,
    // except the localName validation, because it is possible (through the parser) to create elements that
    // do not respect that constraint.

    if (prefix !== null && namespace === null) {
      throw new DOMException("If a prefix is given then a namespace is also required", "NamespaceError");
    }

    if (prefix === "xml" && namespace !== XML_NS) {
      throw new DOMException("If the prefix is \"xml\" then the namespace must be the XML namespace",
        "NamespaceError");
    }

    if (((localName === "xmlns" && prefix === null) || prefix === "xmlns") && namespace !== XMLNS_NS) {
      throw new DOMException(
        "If the prefix or qualified name is \"xmlns\" then the namespace must be the XMLNS namespace",
        "NamespaceError");
    }

    this@[[ownerDocument]] = document;
    this@[[localName]] = localName;
    this@[[namespace]] = namespace;
    this@[[prefix]] = prefix;
    this@[[attributes]] = new NamedNodeMap();
  }


  // This symbol will allow subclasses to specify how to create instances of themselves when desired by
  // document.createElement, document.createElementNS, or the parser. If those cases used the constructors directly,
  // that would unnecessarily constrain the signature of the constructor (and the constructor of any subclass!) to
  // always be (localName, document, namespace, prefix).
  static [Symbol.species](localName, namespace, prefix, document) {
    return new this({ localName, namespace, prefix, document });
  }

  ...
}

class HTMLElement extends Element {
  constructor({ localName = undefined, prefix = undefined, document = undefined } = {}) {
    // Maintain invariants from https://dom.spec.whatwg.org/#dom-document-createelement, again ignoring the validation
    if (localName !== undefined && document@[[documentType]] === "html") {
      localName = ToAsciiLowercase(ToString(localName));
    }

    super({ localName, namespace: HTML_NS, prefix, document });
  }

  static [Symbol.species](localName, namespace, prefix, document) {
    if (namespace !== HTML_NS) {
      throw new TypeError("HTML elements cannot be created except in the HTML namespace");
    }

    const allowedLocalNames = elementConstructorRegistry.getNames(this).map(pair => pair.localName);
    if (!allowedLocalNames.includes(localName)) {
      throw new TypeError(`${this.name} must have a local name from the set ${allowedLocalNames}`);
    }
    return new this({ localName, prefix, document });
  }

  ...
}

class HTMLUnknownElement extends HTMLElement {
  // Default constructor is fine. Calling `new HTMLUnknownElement({ localName: "foo" })` will work since a lookup
  // of ("foo", HTML_NS) in the registry returns `HTMLUnknownElement`. But calling
  // `new HTMLUnknownElement({ localName: "p "})` will not work since looking up ("p", HTML_NS) in the registry returns
  // `HTMLParagraphElement`.
}

// Example of a class with only one entry in the (localName, namespace) -> class table
class HTMLParagraphElement extends HTMLElement {
  // Default constructor is fine. Calling `new HTMLParagraphElement()` will cause a lookup to find that
  // HTMLParagraphElement corresponds to "p".

  ...
}

// Example of a class with more than one entry in the (localName, namespace) -> class table
class HTMLQuoteElement extends HTMLElement {
  // Default constructor is fine. Calling `new HTMLQuoteElement()` will throw an error since it's ambiguous,
  // but calling `new HTMLQuoteElement({ localName: "q" })` will work.

  ...
}

// Example of a custom element class
class CustomElement extends HTMLElement {
  // should not override constructor (or [Symbol.species]).

  ...
}

class Document extends Node {
  ...

  // These mostly delegate to the constructors, but have more validation checks for whatever reason.
  createElement(localName) {
    if (!matchesNameProduction(localName)) {
      throw new DOMException(`The argument "${localName}" does not match the Name production.`,
        "InvalidCharacterError");
    }

    // The constructor will maintain the invariant, but we still need to canonicalize ahead of time for the lookup.
    if (this@[[documentType]] === "html") {
      localName = ToAsciiLowercase(localName);
    }

    const Constructor = elementConstructorRegistry.getConstructor(localName, HTML_NS);
    assert(Constructor === HTMLElement || Constructor instanceof HTMLElement);
    return Constructor[Symbol.species](localName, HTML_NS, null, this);
  }

  createElementNS(namespaceArg, qualifiedNameArg) {
    const { namespace, prefix, localName, qualifiedName } = validateAndExtract(namespaceArg, qualifiedNameArg);

    const Constructor = elementConstructorRegistry.getConstructor(localName, namespace);
    return Constructor[Symbol.species](localName, namespace, prefix, this);
  }

  ...
}

// Examples:

// Creating arbitrary elements which don't have any class registered for them works fine:
new Element({ localName: "foo" }); // namespace = null
new Element({ localName: "foo", namespace: "http://examplens.com/" });
new Element({ localName: "foo", namespace: "http://examplens.com/", prefix: "prefix" });

document.createElementNS(null, "foo");
document.createElementNS("http://examplens.com/", "foo");
document.createElementNS("http://examplens.com/", "prefix:foo");

// It doesn't work in the HTML namespace, though. For that you are supposed to use HTMLUnknownElement.
new Element({ localName: "foo", namespace: HTML_NS }); // throws
new HTMLElement({ localName: "foo" }); // throws



// The element constructor is more lenient than createElement on validating names
new Element({ localName: "foo`" }); // works
document.createElementNS(null, "foo`"); // throws

// Same for HTMLUnknownElement
new HTMLUnknownElement({ localName: "foo`" }); // works
document.createElement("foo`"); // throws




// What about a <p> element?
new Element({ localName: "p" }); // works because namespace = null
new Element({ localName: "p", namespace: HTML_NS }); // throws TypeError telling you to use new HTMLParagraphElement
new HTMLElement({ localName: "p" }); // throws TypeError telling you to use new HTMLParagraphElement
new HTMLParagraphElement(); // works!

// <q> element?
new Element({ localName: "q", namespace: HTML_NS }); // throws TypeError telling you to use new HTMLQuoteElement
new HTMLElement({ localName: "q" }); // throws TypeError telling you to use new HTMLQuoteElement
new HTMLQuoteElement({ localName: "q" }); // works!
new HTMLQuoteElement(); // throws saying localName is required

// <section> element?
new Element({ localName: "section", namespace: HTML_NS }); // throws TypeError telling you to use new HTMLElement
new HTMLElement({ localName: "section" }); // works!



// What about that CustomElement I defined?

new CustomElement(); // throws TypeError, as CustomElement is not in the registry.

document.registerElement("custom-el", CustomElement);

new CustomElement();
// works. The auto-generated constructor calls `super()` (with no args), triggering the `localName === undefined`
// branch in the `HTMLElement` constructor. This looks up `CustomElement` in the registry and finds
// ("custom-el", HTML_NS), at which point it proceeds as usual.

new CustomElement({ prefix: "prefix", document: someDocument }); // You can also pass these arguments in!

// Just like with built-in elements, you can't use the wrong constructor
new Element({ localName: "custom-el", namespace: HTML_NS }); // throws TypeError telling you to use new CustomElement
new HTMLElement({ localName: "custom-el" }); // throws TypeError telling you to use new CustomElement



// In theory we could allow registering CustomElement for more than one local name. It would work fine. It just would
// make the localName option to the constructor required---the same as `HTMLQuoteElement`.



// Illustrations of how exactly createElement/createElementNS end up working:

document.createElement("p");
// works, giving back a HTMLParagraphElement, by calling
// `HTMLParagraphElement[Symbol.species]("p", HTML_NS, null, document)` which returns
// `new HTMLParagraphElement({ localName: "p", prefix: null, document })`
// which is handled by the default HTMLElement constructor.

document.createElementNS(HTML_NS, "p");
// works in the same way

document.createElement("q");
// works, giving back a HTMLQuoteElement, by calling
// `HTMLQuoteElement[Symbol.species]("q", HTML_NS, null, document)` which returns
// ``new HTMLQuoteElement({ localName: "q", prefix: null, document })`

document.createElement("section");
// works, giving back a HTMLElement, by calling
// `HTMLElement[Symbol.species]("section", HTML_NS, null, document)` which returns
// `new HTMLElement({ localName: "section", prefix: null, document })`

document.createElement("foo");
// works, giving back a HTMLUnknownElement, by calling
// `HTMLUnknownElement[Symbol.species]("foo", HTML_NS, null, document)` which returns
// `new HTMLUnknownElement({ localName: "foo", prefix: null, document })`

document.createElement("custom-el");
// works, giving back a CustomElement, by calling
// `CustomElement[Symbol.species]("custom-el", HTML_NS, null, document)` which is not overridden
// which returns
// `new CustomElement({ localName: "custom-el", prefix: null, document })`
