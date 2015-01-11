class ElementConstructorRegistry {
  get(localName, namespace) {
    // Returns the registered constructor if one exists.
    // Otherwise if the namespace is HTML_NS, returns HTMLUnkownElement.
    // Otherwise returns Element.
  }
  set(localName, namespace, constructor) { ... }
  has(localname, namespace) { ... }
}

const elementConstructorRegistry = new ElementConstructorRegistry();
// Register all the elements from all the specs ever here.
// E.g.:
elementConstructorRegistry.set("p", HTML_NS, null, HTMLParagraphElement);
elementConstructorRegistry.set("q", HTML_NS, null, HTMLQuoteElement);
elementConstructorRegistry.set("blockquote", HTML_NS, null, HTMLQuoteElement);
elementConstructorRegistry.set("section", HTML_NS, null, HTMLElement);
elementConstructorRegistry.set("aside", HTML_NS, null, HTMLElement);
// ...

assert(/* no entries in the registry have namespace HTML_NS that are not === HTMLElement or instanceof HTMLElement */);

class Element extends Node {
  constructor(localName, namespace = null, prefix = null,
              document = GetFunctionRealm(new.target)@[[globalThis]].document) {
    // TODO: gotta call super() to allocate a Node, but I didn't take the time to specify the Node constructor.
    // Node seems to want a base URL, so maybe that needs to be a constructor parameter? Can it always be derived
    // from the passed document for Element, or does that only work for HTMLElement?

    if (localName === undefined) {
      throw new TypeError("localName is a required argument");
    }
    if (!brandCheck(document, Document)) {
      throw new TypeError("The document argument is required and must be a Document");
    }
    localName = ToString(localName);
    namespace = namespace !== null ? ToString(namespace) : namespace;
    prefix = prefix !== null ? ToString(prefix) : prefix;

    // Maintain the invariants of https://dom.spec.whatwg.org/#validate-and-extract,
    // except the localName validation, because it is possible (through the parser) to create elements that
    // do not respect that constraint.
    if (namespace === "") {
      namespace = null;
    }

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

    const Constructor = elementConstructorRegistry.get(localName, namespace);
    if (Constructor !== new.target) {
      throw new TypeError(`The Element constructor cannot be used to create elements with local name ` +
        `"${localName}" and namespace "${namespace}". Use the ${constructor.name} constructor instead.`);
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
    return new this(localName, namespace, prefix, document);
  }

  ...
}

class HTMLElement extends Element {
  constructor(localName, prefix, document) {
    if (localName === undefined) {
      throw new TypeError("localName is a required argument");
    }
    localName = ToString(localName);

    // Maintain invariants from https://dom.spec.whatwg.org/#dom-document-createelement, again ignoring the validation
    if (document@[[documentType]] === "html") {
      localName = ToAsciiLowercase(localName);
    }

    super(localName, HTML_NS, prefix, document);
  }

  static [Symbol.species](localName, namespace, prefix, document) {
    if (namespace !== HTML_NS) {
      throw new TypeError("HTML elements cannot be created except in the HTML namespace");
    }
    return new this(localName, prefix, document);
  }

  ...
}

class HTMLUnkownElement extends HTMLElement {
  constructor(localName, prefix, document) {
    if (elementConstructorRegistry.has(localName, HTML_NS)) {
      throw new TypeError(`Cannot create a HTMLUnkownElement with local name "${localName}"`);
    }

    super(localName, prefix, document);
  }
}

// Example of a class with only one entry in the (localName, namespace) -> class table
class HTMLParagraphElement extends HTMLElement {
  constructor(prefix, document) {
    super("p", prefix, document);
  }

  static [Symbol.species](localName, namespace, prefix, document) {
    if (localName !== "p") {
      throw new TypeError("HTMLParagraphElement must have local name \"p\"");
    }
    if (namespace !== HTML_NS) {
      throw new TypeError("HTMLParagraphElement elements cannot be created except in the HTML namespace");
    }
    return new this(prefix, document);
  }

  ...
}

// Example of a class with more than one entry in the (localName, namespace) -> class table
class HTMLQuoteElement extends HTMLElement {
  constructor(localName, prefix, document) {
    if (localName !== "q" && localName !== "blockquote") {
      throw new TypeError("HTMLQuoteElements must have local name \"q\" or \"blockquote\"");
    }

    super(localName, document);
  }

  static [Symbol.species](localName, namespace, prefix, document) {
    if (namespace !== HTML_NS) {
      throw new TypeError("HTMLParagraphElement elements cannot be created except in the HTML namespace");
    }
    return new this(localName, prefix, document);
  }

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

    const Constructor = elementConstructorRegistry.get(localName, HTML_NS);
    assert(Constructor === HTMLElement || Constructor instanceof HTMLElement);
    return Constructor[Symbol.species](localName, HTML_NS, null, this);
  }

  // These mostly delegate to the constructors, but have more validation checks for whatever reason.
  createElementNS(namespaceArg, qualifiedNameArg) {
    const { namespace, prefix, localName, qualifiedName } = validateAndExtract(namespaceArg, qualifiedNameArg);

    const Constructor = elementConstructorRegistry.get(localName, namespace);
    return Constructor[Symbol.species](localName, namespace, prefix, this);
  }

  ...
}

// Examples:

// Creating arbitrary elements which don't have any class registered for them works fine:
new Element("foo"); // namespace = null
new Element("foo", "http://examplens.com/");
new Element("foo", "http://examplens.com/", "prefix");

document.createElementNS(null, "foo");
document.createElementNS("http://examplens.com/", "foo");
document.createElementNS("http://examplens.com/", "prefix:foo");

// The element constructor is more lenient than createElement on validating names
new Element("foo`"); // works
document.createElementNS(null, "foo`"); // throws

// Same for HTMLUnknownElement
new HTMLUnknownElement("foo`"); // works
document.createElement("foo`"); // throws

// What about a <p> element?
new Element("p"); // works because namespace = null
new Element("p", HTML_NS); // throws TypeError telling you to use new HTMLParagraphElement
new HTMLElement("p"); // throws TypeError telling you to use new HTMLParagraphElement
new HTMLParagraphElement(); // works!

// <q> element?
new Element("q", HTML_NS); // throws TypeError telling you to use new HTMLQuoteElement
new HTMLElement("q"); // throws TypeError telling you to use new HTMLQuoteElement
new HTMLQuoteElement("q"); // works!

// <section> element?
new Element("section", HTML_NS); // throws TypeError telling you to use new HTMLElement
new HTMLElement("section"); // works!

document.createElement("p");
// works of course, giving back a HTMLParagraphElement, by calling
// `HTMLParagraphElement[Symbol.species]("p", HTML_NS, null, document)` which returns
// `new HTMLParagraphElement(null, document)`

document.createElementNS(HTML_NS, "p");
// works in the same way

document.createElement("q");
// works, giving back a HTMLQuoteElement, by calling
// `HTMLQuoteElement[Symbol.species]("q", HTML_NS, null, docuemnt)` which returns
// `new HTMLQuoteElement("q", null, document)`

document.createElement("section");
// works, giving back a HTMLElement, by calling
// `HTMLElement[Symbol.species]("section", HTML_NS, null, document)` which returns
// `new HTMLElement("section", null, document)`

document.createElement("foo");
// works, giving back a HTMLUnkownElement, by calling
// `HTMLUnkownElement[Symbol.species]("foo", HTML_NS, null, document)` which returns
// `new HTMLUnkownElement("foo", null, document)`
