/**
 * Base Parser Class
 *
 * Abstract base class providing common XML parsing utilities
 * for all MES-specific parsers. Mirrors the BaseGenerator pattern.
 */

import { v4 as uuidv4 } from 'uuid';

// Type for xml2js parsed result
interface XmlNode {
  $?: Record<string, string>;
  _?: string;
  [key: string]: XmlNode[] | Record<string, string> | string | undefined;
}

/**
 * Synchronously parse XML to normalized structure
 */
function parseXmlSync(xml: string): XmlNode {
  // Simple synchronous XML parser for basic structure
  const result: XmlNode = {};

  // Remove XML declaration
  const cleanXml = xml.replace(/<\?xml[^?]*\?>/g, '').trim();

  // Parse root element
  const rootMatch = cleanXml.match(/^<([a-zA-Z_][a-zA-Z0-9_:-]*)([^>]*)>/);
  if (!rootMatch) return result;

  const rootName = rootMatch[1];
  result[rootName] = [parseElementSync(cleanXml, rootName)];

  return result;
}

/**
 * Parse a single XML element recursively
 */
function parseElementSync(xml: string, tagName: string): XmlNode {
  const node: XmlNode = {};

  // Find opening tag with attributes
  const openTagRegex = new RegExp(`<${escapeRegex(tagName)}([^>]*)>`, 's');
  const openMatch = xml.match(openTagRegex);
  if (!openMatch) return node;

  // Parse attributes
  const attrStr = openMatch[1];
  if (attrStr.trim()) {
    node.$ = {};
    const attrRegex = /([a-zA-Z_][a-zA-Z0-9_:-]*)\s*=\s*["']([^"']*)["']/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
      node.$[attrMatch[1]] = decodeXmlEntities(attrMatch[2]);
    }
  }

  // Get inner content
  const innerContent = extractInnerContent(xml, tagName);
  if (!innerContent) return node;

  // Check if this is a text-only element
  if (!/<[a-zA-Z]/.test(innerContent)) {
    node._ = decodeXmlEntities(innerContent.trim());
    return node;
  }

  // Parse child elements
  const childTagRegex = /<([a-zA-Z_][a-zA-Z0-9_:-]*)(?:\s[^>]*)?>(?:[\s\S]*?<\/\1>|[^>]*\/>)/g;
  let childMatch;
  const processedChildren = new Map<string, XmlNode[]>();

  // Use a simpler approach: find all direct children
  let pos = 0;
  while (pos < innerContent.length) {
    // Find next opening tag
    const tagStart = innerContent.indexOf('<', pos);
    if (tagStart === -1) break;

    // Skip if it's a closing tag or comment
    if (innerContent[tagStart + 1] === '/' || innerContent[tagStart + 1] === '!') {
      pos = tagStart + 1;
      continue;
    }

    // Extract tag name
    const tagNameMatch = innerContent.slice(tagStart).match(/^<([a-zA-Z_][a-zA-Z0-9_:-]*)/);
    if (!tagNameMatch) {
      pos = tagStart + 1;
      continue;
    }

    const childTagName = tagNameMatch[1];
    const childXml = extractElementWithContent(innerContent.slice(tagStart), childTagName);

    if (childXml) {
      const childNode = parseElementSync(childXml, childTagName);

      if (!processedChildren.has(childTagName)) {
        processedChildren.set(childTagName, []);
      }
      processedChildren.get(childTagName)!.push(childNode);

      pos = tagStart + childXml.length;
    } else {
      pos = tagStart + 1;
    }
  }

  // Add children to node
  for (const [name, children] of processedChildren) {
    node[name] = children;
  }

  return node;
}

/**
 * Extract inner content of an element
 */
function extractInnerContent(xml: string, tagName: string): string | null {
  const openTagRegex = new RegExp(`<${escapeRegex(tagName)}[^>]*>`, 's');
  const openMatch = xml.match(openTagRegex);
  if (!openMatch) return null;

  const startIdx = openMatch.index! + openMatch[0].length;

  // Find matching close tag with nesting support
  let depth = 1;
  let pos = startIdx;
  const openPattern = new RegExp(`<${escapeRegex(tagName)}(?:\\s[^>]*)?>`, 'g');
  const closePattern = new RegExp(`</${escapeRegex(tagName)}>`, 'g');

  while (depth > 0 && pos < xml.length) {
    openPattern.lastIndex = pos;
    closePattern.lastIndex = pos;

    const nextOpen = openPattern.exec(xml);
    const nextClose = closePattern.exec(xml);

    if (!nextClose) break;

    if (nextOpen && nextOpen.index < nextClose.index && !nextOpen[0].endsWith('/>')) {
      depth++;
      pos = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      if (depth === 0) {
        return xml.slice(startIdx, nextClose.index);
      }
      pos = nextClose.index + nextClose[0].length;
    }
  }

  return null;
}

/**
 * Extract a complete element with its content
 */
function extractElementWithContent(xml: string, tagName: string): string | null {
  // Check for self-closing tag
  const selfCloseRegex = new RegExp(`^<${escapeRegex(tagName)}[^>]*/>`);
  const selfCloseMatch = xml.match(selfCloseRegex);
  if (selfCloseMatch) return selfCloseMatch[0];

  const openTagRegex = new RegExp(`^<${escapeRegex(tagName)}[^>]*>`, 's');
  const openMatch = xml.match(openTagRegex);
  if (!openMatch) return null;

  // Find matching close tag with nesting support
  let depth = 1;
  let pos = openMatch[0].length;
  const openPattern = new RegExp(`<${escapeRegex(tagName)}(?:\\s[^>]*)?>`, 'g');
  const closePattern = new RegExp(`</${escapeRegex(tagName)}>`, 'g');

  while (depth > 0 && pos < xml.length) {
    openPattern.lastIndex = pos;
    closePattern.lastIndex = pos;

    const nextOpen = openPattern.exec(xml);
    const nextClose = closePattern.exec(xml);

    if (!nextClose) break;

    if (nextOpen && nextOpen.index < nextClose.index && !nextOpen[0].endsWith('/>')) {
      depth++;
      pos = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      if (depth === 0) {
        return xml.slice(0, nextClose.index + nextClose[0].length);
      }
      pos = nextClose.index + nextClose[0].length;
    }
  }

  return null;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Wrapper class that provides DOM-like interface over xml2js result
 */
export class XmlElement {
  private node: XmlNode;
  private tagName: string;

  constructor(node: XmlNode, tagName: string = '') {
    this.node = node;
    this.tagName = tagName;
  }

  get localName(): string {
    return this.tagName;
  }

  get nodeName(): string {
    return this.tagName;
  }

  get nodeType(): number {
    return 1;
  }

  get textContent(): string {
    if (this.node._) return this.node._;
    // Recursively get text content
    let text = '';
    for (const key of Object.keys(this.node)) {
      if (key === '$' || key === '_') continue;
      const children = this.node[key] as XmlNode[] | undefined;
      if (Array.isArray(children)) {
        for (const child of children) {
          const childEl = new XmlElement(child, key);
          text += childEl.textContent;
        }
      }
    }
    return text;
  }

  getAttribute(name: string): string | null {
    return this.node.$?.[name] ?? null;
  }

  getElementsByTagName(name: string): XmlElement[] {
    const results: XmlElement[] = [];
    this.collectElements(this.node, name, results);
    return results;
  }

  private collectElements(node: XmlNode, name: string, results: XmlElement[]): void {
    for (const key of Object.keys(node)) {
      if (key === '$' || key === '_') continue;
      const children = node[key] as XmlNode[] | undefined;
      if (Array.isArray(children)) {
        for (const child of children) {
          if (key === name) {
            results.push(new XmlElement(child, key));
          }
          this.collectElements(child, name, results);
        }
      }
    }
  }

  get childNodes(): XmlElement[] {
    const children: XmlElement[] = [];
    for (const key of Object.keys(this.node)) {
      if (key === '$' || key === '_') continue;
      const childNodes = this.node[key] as XmlNode[] | undefined;
      if (Array.isArray(childNodes)) {
        for (const child of childNodes) {
          children.push(new XmlElement(child, key));
        }
      }
    }
    return children;
  }
}

/**
 * Document wrapper for parsed XML
 */
export class XmlDocument {
  private root: XmlNode;
  private rootName: string;

  constructor(parsed: XmlNode) {
    this.root = parsed;
    this.rootName = Object.keys(parsed).find(k => k !== '$' && k !== '_') || '';
  }

  get documentElement(): XmlElement | null {
    if (!this.rootName) return null;
    const rootNodes = this.root[this.rootName] as XmlNode[] | undefined;
    if (!rootNodes || !rootNodes[0]) return null;
    return new XmlElement(rootNodes[0], this.rootName);
  }

  getElementsByTagName(name: string): XmlElement[] {
    const root = this.documentElement;
    if (!root) return [];
    if (root.localName === name) return [root];
    return root.getElementsByTagName(name);
  }
}

import {
  Procedure,
  UnitProcedure,
  Operation,
  Phase,
  Parameter,
  Material,
  Signature,
  Equipment,
  InterfacePoint,
  SignatureType,
  RecipeType,
  ParameterType,
  DataType,
  InterfaceSystem,
  createProcedure,
  createUnitProcedure,
  createOperation,
  createPhase,
  createParameter,
  createSignature,
  createMaterial,
} from '../../models/isa88-canonical';
import {
  MESParser,
  MESSystemId,
  ParserOptions,
  ParserResult,
  ParserStatistics,
} from './types';

/**
 * Abstract base class with common XML parsing functionality
 */
export abstract class BaseParser implements MESParser {
  abstract readonly id: MESSystemId;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly vendor: string;
  abstract readonly rootElement: string;
  abstract readonly namespace: string;
  abstract readonly supportedVersions: string[];

  /**
   * Check if this parser can handle the given XML content
   */
  canParse(xml: string): boolean {
    try {
      const doc = this.parseXmlDocument(xml);
      const root = doc.documentElement;

      if (!root) return false;

      // Check root element name
      const rootName = root.localName || root.nodeName;
      if (rootName !== this.rootElement) return false;

      // Check namespace if present
      const xmlns = root.getAttribute('xmlns');
      if (xmlns && xmlns !== this.namespace) return false;

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse XML content to ISA-88 procedure
   */
  abstract parse(xml: string, options?: ParserOptions): ParserResult;

  /**
   * Detect the format version from XML content
   */
  detectVersion(xml: string): string | undefined {
    try {
      const doc = this.parseXmlDocument(xml);
      const root = doc.documentElement;
      if (!root) return undefined;

      // Try common version attribute names
      return (
        root.getAttribute('version') ||
        root.getAttribute('schemaVersion') ||
        root.getAttribute('formatVersion') ||
        undefined
      );
    } catch {
      return undefined;
    }
  }

  /**
   * Get default options for this parser
   */
  getDefaultOptions(): ParserOptions {
    return {
      strictValidation: false,
      preserveUnmappedData: false,
    };
  }

  // ============================================================================
  // Protected XML Utilities
  // ============================================================================

  /**
   * Parse XML string to Document-like object
   */
  protected parseXmlDocument(xml: string): XmlDocument {
    const parsed = parseXmlSync(xml);
    return new XmlDocument(parsed);
  }

  /**
   * Get text content of an element, safely handling null/undefined
   */
  protected getTextContent(element: XmlElement | null | undefined): string {
    if (!element) return '';
    return (element.textContent || '').trim();
  }

  /**
   * Get text content of the first child element with the given tag name
   */
  protected getChildTextContent(parent: XmlElement, tagName: string): string {
    const child = this.getFirstElement(parent, tagName);
    return this.getTextContent(child);
  }

  /**
   * Get the first element with the given tag name
   */
  protected getFirstElement(parent: XmlElement | XmlDocument, tagName: string): XmlElement | null {
    const elements = parent.getElementsByTagName(tagName);
    return elements.length > 0 ? elements[0] : null;
  }

  /**
   * Get all elements with the given tag name as an array
   */
  protected getElements(parent: XmlElement | XmlDocument, tagName: string): XmlElement[] {
    return parent.getElementsByTagName(tagName);
  }

  /**
   * Get direct child elements with the given tag name
   */
  protected getDirectChildElements(parent: XmlElement, tagName: string): XmlElement[] {
    return parent.childNodes.filter(child => child.localName === tagName);
  }

  /**
   * Get attribute value with optional default
   */
  protected getAttribute(element: XmlElement, name: string, defaultValue: string = ''): string {
    return element.getAttribute(name) || defaultValue;
  }

  /**
   * Parse a number from element text content
   */
  protected parseNumber(element: XmlElement | null | undefined, defaultValue: number = 0): number {
    const text = this.getTextContent(element);
    const num = parseFloat(text);
    return isNaN(num) ? defaultValue : num;
  }

  /**
   * Parse an integer from element text content
   */
  protected parseInt(element: XmlElement | null | undefined, defaultValue: number = 0): number {
    const text = this.getTextContent(element);
    const num = parseInt(text, 10);
    return isNaN(num) ? defaultValue : num;
  }

  /**
   * Parse a boolean from element text content
   */
  protected parseBoolean(element: XmlElement | null | undefined, defaultValue: boolean = false): boolean {
    const text = this.getTextContent(element).toLowerCase();
    if (text === 'true' || text === '1' || text === 'yes') return true;
    if (text === 'false' || text === '0' || text === 'no') return false;
    return defaultValue;
  }

  /**
   * Generate a unique ID if not provided
   */
  protected ensureId(id: string | null | undefined): string {
    return id && id.trim() ? id.trim() : uuidv4();
  }

  // ============================================================================
  // Protected Mapping Utilities
  // ============================================================================

  /**
   * Map status string to ISA-88 status
   */
  protected mapStatus(status: string): 'draft' | 'approved' | 'released' | 'obsolete' {
    const normalized = status.toLowerCase().replace(/[_-]/g, '');

    const mapping: Record<string, 'draft' | 'approved' | 'released' | 'obsolete'> = {
      draft: 'draft',
      indevelopment: 'draft',
      approved: 'approved',
      released: 'released',
      active: 'released',
      effective: 'released',
      obsolete: 'obsolete',
      superseded: 'obsolete',
      inactive: 'obsolete',
    };

    return mapping[normalized] || 'draft';
  }

  /**
   * Map phase type string to ISA-88 phase type
   */
  protected mapPhaseType(type: string): 'manual' | 'automatic' | 'semi-automatic' {
    const normalized = type.toLowerCase().replace(/[_-]/g, '');

    const mapping: Record<string, 'manual' | 'automatic' | 'semi-automatic'> = {
      manual: 'manual',
      automatic: 'automatic',
      automated: 'automatic',
      semiautomatic: 'semi-automatic',
      semiautomated: 'semi-automatic',
      guided: 'semi-automatic',
    };

    return mapping[normalized] || 'manual';
  }

  /**
   * Map signature type string to ISA-88 SignatureType enum
   */
  protected mapSignatureType(type: string): SignatureType {
    const normalized = type.toLowerCase().replace(/[_-]/g, '').replace(/by$/, '');

    const mapping: Record<string, SignatureType> = {
      perform: SignatureType.PERFORM,
      performed: SignatureType.PERFORM,
      verify: SignatureType.VERIFY,
      verified: SignatureType.VERIFY,
      approve: SignatureType.APPROVE,
      approved: SignatureType.APPROVE,
      review: SignatureType.REVIEW,
      reviewed: SignatureType.REVIEW,
      witness: SignatureType.WITNESS,
      witnessed: SignatureType.WITNESS,
    };

    return mapping[normalized] || SignatureType.PERFORM;
  }

  /**
   * Map data type string to ISA-88 DataType enum
   */
  protected mapDataType(type: string): DataType {
    const normalized = type.toLowerCase();

    const mapping: Record<string, DataType> = {
      string: DataType.STRING,
      text: DataType.STRING,
      integer: DataType.INTEGER,
      int: DataType.INTEGER,
      number: DataType.INTEGER,
      real: DataType.REAL,
      double: DataType.REAL,
      decimal: DataType.REAL,
      float: DataType.REAL,
      boolean: DataType.BOOLEAN,
      bool: DataType.BOOLEAN,
      checkbox: DataType.BOOLEAN,
      datetime: DataType.DATETIME,
      date: DataType.DATETIME,
      time: DataType.DATETIME,
      duration: DataType.DURATION,
      timespan: DataType.DURATION,
      enumeration: DataType.ENUMERATION,
      enum: DataType.ENUMERATION,
      select: DataType.ENUMERATION,
      dropdown: DataType.ENUMERATION,
    };

    return mapping[normalized] || DataType.STRING;
  }

  /**
   * Map recipe type string to ISA-88 RecipeType enum
   */
  protected mapRecipeType(type: string): RecipeType {
    const normalized = type.toLowerCase();

    const mapping: Record<string, RecipeType> = {
      general: RecipeType.GENERAL,
      site: RecipeType.SITE,
      master: RecipeType.MASTER,
      control: RecipeType.CONTROL,
    };

    return mapping[normalized] || RecipeType.MASTER;
  }

  /**
   * Map interface system string to ISA-88 InterfaceSystem enum
   */
  protected mapInterfaceSystem(system: string): InterfaceSystem {
    const normalized = system.toUpperCase();

    const mapping: Record<string, InterfaceSystem> = {
      SAP: InterfaceSystem.SAP,
      MES: InterfaceSystem.MES,
      LIMS: InterfaceSystem.LIMS,
      DCS: InterfaceSystem.DCS,
      SCADA: InterfaceSystem.SCADA,
      ERP: InterfaceSystem.ERP,
      QMS: InterfaceSystem.QMS,
    };

    return mapping[normalized] || InterfaceSystem.MES;
  }

  /**
   * Map material type string to ISA-88 material type
   */
  protected mapMaterialType(type: string): 'raw' | 'intermediate' | 'finished' | 'packaging' {
    const normalized = type.toLowerCase();

    const mapping: Record<string, 'raw' | 'intermediate' | 'finished' | 'packaging'> = {
      raw: 'raw',
      intermediate: 'intermediate',
      finished: 'finished',
      packaging: 'packaging',
      bulk: 'raw',
      component: 'raw',
    };

    return mapping[normalized] || 'raw';
  }

  // ============================================================================
  // Protected Factory Methods
  // ============================================================================

  /**
   * Create an empty procedure with basic header info
   */
  protected createBaseProcedure(
    id: string,
    name: string,
    version: string = '1.0'
  ): Procedure {
    const now = new Date().toISOString();
    return {
      id: this.ensureId(id),
      header: {
        id: this.ensureId(id),
        name: name || 'Unnamed Procedure',
        version: version || '1.0',
        createdDate: now,
        modifiedDate: now,
        status: 'draft',
        recipeType: RecipeType.MASTER,
      },
      unitProcedures: [],
      transitions: [],
      equipmentRequirements: [],
    };
  }

  /**
   * Create a unit procedure
   */
  protected createUnitProcedure(
    id: string,
    name: string,
    sequence: number
  ): UnitProcedure {
    return {
      id: this.ensureId(id),
      name: name || `Unit Procedure ${sequence}`,
      sequence,
      operations: [],
      transitions: [],
      equipment: [],
      parameters: [],
      signatures: [],
    };
  }

  /**
   * Create an operation
   */
  protected createOperation(
    id: string,
    name: string,
    sequence: number
  ): Operation {
    return {
      id: this.ensureId(id),
      name: name || `Operation ${sequence}`,
      sequence,
      phases: [],
      transitions: [],
      parameters: [],
      signatures: [],
    };
  }

  /**
   * Create a phase
   */
  protected createPhase(
    id: string,
    name: string,
    sequence: number,
    type: 'manual' | 'automatic' | 'semi-automatic' = 'manual'
  ): Phase {
    return {
      id: this.ensureId(id),
      name: name || `Phase ${sequence}`,
      sequence,
      type,
      parameters: [],
      materials: [],
      signatures: [],
      interfaces: [],
    };
  }

  /**
   * Create a parameter
   */
  protected createParameter(
    id: string,
    name: string,
    dataType: DataType = DataType.STRING,
    options: Partial<Parameter> = {}
  ): Parameter {
    return {
      id: this.ensureId(id),
      name: name || 'Unnamed Parameter',
      type: ParameterType.PROCESS,
      dataType,
      required: false,
      ...options,
    };
  }

  /**
   * Create a signature requirement
   */
  protected createSignature(
    id: string,
    type: SignatureType,
    role: string,
    order: number
  ): Signature {
    return {
      id: this.ensureId(id),
      type,
      role: role || 'Operator',
      required: true,
      order,
    };
  }

  /**
   * Create a material
   */
  protected createMaterial(
    id: string,
    code: string,
    name: string,
    quantity: number,
    unit: string
  ): Material {
    return {
      id: this.ensureId(id),
      code: code || id,
      name: name || 'Unnamed Material',
      quantity,
      unit: unit || 'EA',
      type: 'raw',
      scalable: true,
    };
  }

  /**
   * Create an equipment requirement
   */
  protected createEquipment(
    id: string,
    code: string,
    name: string,
    type: string
  ): Equipment {
    return {
      id: this.ensureId(id),
      code: code || id,
      name: name || 'Unnamed Equipment',
      type: type || 'General',
    };
  }

  /**
   * Create an interface point
   */
  protected createInterfacePoint(
    id: string,
    system: InterfaceSystem,
    direction: 'input' | 'output' | 'bidirectional'
  ): InterfacePoint {
    return {
      id: this.ensureId(id),
      system,
      direction,
      dataMapping: [],
    };
  }

  // ============================================================================
  // Protected Statistics Generation
  // ============================================================================

  /**
   * Generate parsing statistics for a procedure
   */
  protected generateStatistics(procedure: Procedure): ParserStatistics {
    let operations = 0;
    let phases = 0;
    let parameters = 0;
    let materials = 0;
    let signatures = 0;

    procedure.unitProcedures.forEach(up => {
      signatures += up.signatures.length;
      parameters += up.parameters.length;

      up.operations.forEach(op => {
        operations++;
        signatures += op.signatures.length;
        parameters += op.parameters.length;

        op.phases.forEach(ph => {
          phases++;
          parameters += ph.parameters.length;
          materials += ph.materials.length;
          signatures += ph.signatures.length;
        });
      });
    });

    // Add formula materials if present
    if (procedure.formula) {
      materials += procedure.formula.materials.length;
      parameters += procedure.formula.parameters?.length || 0;
    }

    return {
      unitProcedures: procedure.unitProcedures.length,
      operations,
      phases,
      parameters,
      materials,
      signatures,
      totalElements: procedure.unitProcedures.length + operations + phases,
    };
  }

  /**
   * Create a parser result object
   */
  protected createResult(
    procedure: Procedure,
    warnings: string[] = [],
    unmappedData?: Record<string, unknown>
  ): ParserResult {
    return {
      procedure,
      sourceSystem: this.id,
      sourceSystemName: this.name,
      sourceVendor: this.vendor,
      statistics: this.generateStatistics(procedure),
      parsedAt: new Date().toISOString(),
      warnings,
      unmappedData,
    };
  }
}
