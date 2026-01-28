/**
 * PAS-X Parser
 *
 * Parses Werum PAS-X MES XML format to ISA-88 canonical model.
 * This parser reverses the logic from pasx-generator.ts.
 *
 * Expected XML structure:
 * <Recipe xmlns="http://www.werum.com/pas-x/recipe">
 *   <Header>...</Header>
 *   <EquipmentRequirements>...</EquipmentRequirements>
 *   <Formula>...</Formula>
 *   <ProcedureBody>
 *     <UnitProcedure>
 *       <Operations>
 *         <Operation>
 *           <Phases>
 *             <Phase>...</Phase>
 *           </Phases>
 *         </Operation>
 *       </Operations>
 *     </UnitProcedure>
 *   </ProcedureBody>
 *   <CleaningManagement>...</CleaningManagement>
 *   <SignatureStrategy>...</SignatureStrategy>
 * </Recipe>
 */

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
  DataType,
  InterfaceSystem,
} from '../../models/isa88-canonical';
import { BaseParser, XmlElement } from './base-parser';
import { MESSystemId, ParserOptions, ParserResult } from './types';

export class PasXParser extends BaseParser {
  readonly id: MESSystemId = 'pasx';
  readonly name = 'Werum PAS-X';
  readonly description = 'Werum PAS-X Manufacturing Execution System XML Parser';
  readonly vendor = 'Werum IT Solutions (Körber)';
  readonly rootElement = 'Recipe';
  readonly namespace = 'http://www.werum.com/pas-x/recipe';
  readonly supportedVersions = ['3.2', '3.3', '4.0'];

  parse(xml: string, options?: ParserOptions): ParserResult {
    const opts = { ...this.getDefaultOptions(), ...options };
    const warnings: string[] = [];
    const unmappedData: Record<string, unknown> = {};

    const doc = this.parseXmlDocument(xml);
    const root = doc.documentElement;

    if (!root || (root.localName !== 'Recipe' && root.nodeName !== 'Recipe')) {
      throw new Error('Invalid PAS-X XML: Root element must be <Recipe>');
    }

    // Parse header
    const headerElement = this.getFirstElement(root, 'Header');
    const procedure = this.parseHeader(headerElement, warnings);

    // Parse equipment requirements
    const equipmentElement = this.getFirstElement(root, 'EquipmentRequirements');
    if (equipmentElement) {
      procedure.equipmentRequirements = this.parseEquipmentRequirements(equipmentElement);
    }

    // Parse formula
    const formulaElement = this.getFirstElement(root, 'Formula');
    if (formulaElement) {
      procedure.formula = this.parseFormula(formulaElement);
    }

    // Parse procedure body
    const bodyElement = this.getFirstElement(root, 'ProcedureBody');
    if (bodyElement) {
      procedure.unitProcedures = this.parseProcedureBody(bodyElement, warnings);
    } else {
      warnings.push('No ProcedureBody element found');
    }

    // Parse cleaning management (preserve as unmapped if option enabled)
    if (opts.preserveUnmappedData) {
      const cleaningElement = this.getFirstElement(root, 'CleaningManagement');
      if (cleaningElement) {
        unmappedData.cleaningManagement = this.parseCleaningManagement(cleaningElement);
      }

      const signatureStrategyElement = this.getFirstElement(root, 'SignatureStrategy');
      if (signatureStrategyElement) {
        unmappedData.signatureStrategy = this.parseSignatureStrategy(signatureStrategyElement);
      }
    }

    // Detect version
    const version = this.detectVersion(xml);
    const result = this.createResult(procedure, warnings, opts.preserveUnmappedData ? unmappedData : undefined);

    if (version) {
      result.sourceVersion = version;
    }

    return result;
  }

  private parseHeader(element: XmlElement | null, warnings: string[]): Procedure {
    if (!element) {
      warnings.push('No Header element found, using defaults');
      return this.createBaseProcedure('', 'Unnamed Recipe');
    }

    const id = this.getChildTextContent(element, 'RecipeId');
    const name = this.getChildTextContent(element, 'RecipeName');
    const version = this.getChildTextContent(element, 'Version') || '1.0';
    const statusStr = this.getChildTextContent(element, 'Status');
    const recipeTypeStr = this.getChildTextContent(element, 'RecipeType');
    const productCode = this.getChildTextContent(element, 'ProductCode');
    const productName = this.getChildTextContent(element, 'ProductName');
    const description = this.getChildTextContent(element, 'Description');
    const createdDate = this.getChildTextContent(element, 'CreatedDate') || new Date().toISOString();
    const modifiedDate = this.getChildTextContent(element, 'ModifiedDate') || createdDate;
    const author = this.getChildTextContent(element, 'Author');

    const procedure = this.createBaseProcedure(id, name, version);

    procedure.header.status = this.mapStatus(statusStr);
    procedure.header.recipeType = this.mapRecipeType(recipeTypeStr);
    procedure.header.createdDate = createdDate;
    procedure.header.modifiedDate = modifiedDate;

    if (productCode) procedure.header.productCode = productCode;
    if (productName) procedure.header.productName = productName;
    if (description) procedure.header.description = description;
    if (author) procedure.header.author = author;

    return procedure;
  }

  private parseEquipmentRequirements(element: XmlElement): Equipment[] {
    const equipment: Equipment[] = [];
    const equipmentElements = this.getElements(element, 'Equipment');

    equipmentElements.forEach(eq => {
      const id = this.getChildTextContent(eq, 'EquipmentId');
      const code = this.getChildTextContent(eq, 'EquipmentCode');
      const name = this.getChildTextContent(eq, 'EquipmentName');
      const type = this.getChildTextContent(eq, 'EquipmentType');

      equipment.push(this.createEquipment(id, code, name, type));
    });

    return equipment;
  }

  private parseFormula(element: XmlElement): { materials: Material[]; parameters: Parameter[]; scalingBasis?: string } {
    const materials: Material[] = [];
    const parameters: Parameter[] = [];
    const materialsElement = this.getFirstElement(element, 'Materials');

    if (materialsElement) {
      const materialElements = this.getElements(materialsElement, 'Material');

      materialElements.forEach(mat => {
        const code = this.getChildTextContent(mat, 'MaterialCode');
        const name = this.getChildTextContent(mat, 'MaterialName');
        const quantity = this.parseNumber(this.getFirstElement(mat, 'Quantity'));
        const unit = this.getChildTextContent(mat, 'Unit');
        const typeStr = this.getChildTextContent(mat, 'Type');
        const scalable = this.parseBoolean(this.getFirstElement(mat, 'Scalable'), true);

        const material = this.createMaterial(code, code, name, quantity, unit);
        material.type = this.mapMaterialType(typeStr);
        material.scalable = scalable;

        materials.push(material);
      });
    }

    return { materials, parameters };
  }

  private parseProcedureBody(element: XmlElement, warnings: string[]): UnitProcedure[] {
    const unitProcedures: UnitProcedure[] = [];
    const upElements = this.getElements(element, 'UnitProcedure');

    upElements.forEach((upEl, idx) => {
      const id = this.getChildTextContent(upEl, 'UnitProcedureId');
      const name = this.getChildTextContent(upEl, 'Name');
      const sequence = this.parseInt(this.getFirstElement(upEl, 'Sequence'), idx + 1);
      const description = this.getChildTextContent(upEl, 'Description');

      const unitProcedure = this.createUnitProcedure(id, name, sequence);
      if (description) unitProcedure.description = description;

      // Parse operations
      const operationsElement = this.getFirstElement(upEl, 'Operations');
      if (operationsElement) {
        unitProcedure.operations = this.parseOperations(operationsElement, warnings);
      }

      unitProcedures.push(unitProcedure);
    });

    return unitProcedures;
  }

  private parseOperations(element: XmlElement, warnings: string[]): Operation[] {
    const operations: Operation[] = [];
    const opElements = this.getElements(element, 'Operation');

    opElements.forEach((opEl, idx) => {
      const id = this.getChildTextContent(opEl, 'OperationId');
      const name = this.getChildTextContent(opEl, 'Name');
      const sequence = this.parseInt(this.getFirstElement(opEl, 'Sequence'), idx + 1);
      const description = this.getChildTextContent(opEl, 'Description');

      const operation = this.createOperation(id, name, sequence);
      if (description) operation.description = description;

      // Parse phases
      const phasesElement = this.getFirstElement(opEl, 'Phases');
      if (phasesElement) {
        operation.phases = this.parsePhases(phasesElement, warnings);
      }

      operations.push(operation);
    });

    return operations;
  }

  private parsePhases(element: XmlElement, warnings: string[]): Phase[] {
    const phases: Phase[] = [];
    const phaseElements = this.getElements(element, 'Phase');

    phaseElements.forEach((phEl, idx) => {
      const id = this.getChildTextContent(phEl, 'PhaseId');
      const name = this.getChildTextContent(phEl, 'Name');
      const sequence = this.parseInt(this.getFirstElement(phEl, 'Sequence'), idx + 1);
      const typeStr = this.getChildTextContent(phEl, 'Type');
      const instructions = this.getChildTextContent(phEl, 'Instructions');

      const phase = this.createPhase(id, name, sequence, this.mapPhaseType(typeStr));
      if (instructions) phase.instructions = instructions;

      // Parse interfaces
      const interfacesElement = this.getFirstElement(phEl, 'Interfaces');
      if (interfacesElement) {
        phase.interfaces = this.parseInterfaces(interfacesElement);
      }

      // Parse signatures
      const signaturesElement = this.getFirstElement(phEl, 'Signatures');
      if (signaturesElement) {
        phase.signatures = this.parseSignatures(signaturesElement);
      }

      phases.push(phase);
    });

    return phases;
  }

  private parseInterfaces(element: XmlElement): InterfacePoint[] {
    const interfaces: InterfacePoint[] = [];
    const ifaceElements = this.getElements(element, 'Interface');

    ifaceElements.forEach((ifEl, idx) => {
      const systemStr = this.getChildTextContent(ifEl, 'System');
      const directionStr = this.getChildTextContent(ifEl, 'Direction').toLowerCase();

      const direction: 'input' | 'output' | 'bidirectional' =
        directionStr === 'input' ? 'input' :
        directionStr === 'output' ? 'output' : 'bidirectional';

      interfaces.push(this.createInterfacePoint(
        `interface-${idx + 1}`,
        this.mapInterfaceSystem(systemStr),
        direction
      ));
    });

    return interfaces;
  }

  private parseSignatures(element: XmlElement): Signature[] {
    const signatures: Signature[] = [];
    const sigElements = this.getElements(element, 'Signature');

    sigElements.forEach(sigEl => {
      const typeStr = this.getChildTextContent(sigEl, 'Type');
      const role = this.getChildTextContent(sigEl, 'Role');
      const order = this.parseInt(this.getFirstElement(sigEl, 'Order'), 1);
      const required = this.parseBoolean(this.getFirstElement(sigEl, 'Required'), true);

      const signature = this.createSignature(
        `sig-${order}`,
        this.mapSignatureType(typeStr),
        role,
        order
      );
      signature.required = required;

      signatures.push(signature);
    });

    return signatures;
  }

  private parseCleaningManagement(element: XmlElement): Record<string, unknown> {
    return {
      cleaningStrategy: this.getChildTextContent(element, 'CleaningStrategy'),
      maxCampaignBatches: this.parseInt(this.getFirstElement(element, 'MaxCampaignBatches')),
    };
  }

  private parseSignatureStrategy(element: XmlElement): Record<string, unknown> {
    return {
      level: this.getChildTextContent(element, 'Level'),
      electronicSignature: this.parseBoolean(this.getFirstElement(element, 'ElectronicSignature')),
      requireComment: this.parseBoolean(this.getFirstElement(element, 'RequireComment')),
    };
  }
}

// Export singleton instance
export const pasxParser = new PasXParser();
