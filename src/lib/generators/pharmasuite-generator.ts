/**
 * PharmaSuite Generator
 *
 * Generates Rockwell Automation PharmaSuite MES compatible XML from ISA-88 canonical model.
 * PharmaSuite is built on FactoryTalk ProductionCentre and follows ISA-95/ISA-88 standards.
 */

import {
  Procedure,
  UnitProcedure,
  Operation,
  Phase,
  SignatureType,
} from '../models/isa88-canonical';
import { BaseGenerator, GeneratorOptions, GeneratorResult } from './base-generator';

export interface PharmaSuiteOptions extends GeneratorOptions {
  enterpriseId?: string;
  siteId?: string;
  areaId?: string;
  includeB2MML?: boolean;
  workDefinitionLevel?: 'segment' | 'operation' | 'job';
}

export class PharmaSuiteGenerator extends BaseGenerator {
  readonly id = 'pharmasuite';
  readonly name = 'Rockwell PharmaSuite';
  readonly description = 'Rockwell Automation PharmaSuite MES (FactoryTalk ProductionCentre)';
  readonly vendor = 'Rockwell Automation';
  readonly supportedVersions = ['6.0', '6.1', '7.0'];

  private readonly b2mmlNamespace = 'http://www.mesa.org/xml/B2MML';

  generate(procedure: Procedure, options?: PharmaSuiteOptions): GeneratorResult {
    const opts: PharmaSuiteOptions = {
      ...this.getDefaultOptions(),
      ...options,
    };

    const xml = this.buildXml(procedure, opts);
    const stats = this.generateStatistics(procedure);

    return {
      content: opts.prettyPrint ? this.formatXml(xml) : xml,
      format: 'PharmaSuite B2MML Recipe',
      mimeType: 'application/xml',
      fileExtension: 'xml',
      metadata: {
        generator: this.id,
        version: opts.targetVersion || '7.0',
        generatedAt: new Date().toISOString(),
        procedureName: procedure.header.name,
        statistics: stats,
      },
    };
  }

  getDefaultOptions(): PharmaSuiteOptions {
    return {
      ...super.getDefaultOptions(),
      enterpriseId: 'ENTERPRISE',
      siteId: 'SITE-001',
      areaId: 'AREA-001',
      includeB2MML: true,
      workDefinitionLevel: 'segment',
    };
  }

  private buildXml(procedure: Procedure, options: PharmaSuiteOptions): string {
    const parts: string[] = [];

    // XML Declaration
    parts.push(`<?xml version="1.0" encoding="${options.encoding || 'UTF-8'}"?>`);

    if (options.includeB2MML) {
      // B2MML format (ISA-95 compliant)
      parts.push(`<ProductDefinition xmlns="${this.b2mmlNamespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`);
      parts.push(this.buildB2MMLContent(procedure, options));
      parts.push('</ProductDefinition>');
    } else {
      // Native PharmaSuite format
      parts.push('<PharmaSuiteRecipe xmlns="http://www.rockwell.com/pharmasuite/recipe">');
      parts.push(this.buildNativeContent(procedure, options));
      parts.push('</PharmaSuiteRecipe>');
    }

    return parts.join('\n');
  }

  private buildB2MMLContent(procedure: Procedure, options: PharmaSuiteOptions): string {
    const h = procedure.header;
    return `
  <ID>${this.escapeXml(h.id)}</ID>
  <Description>${this.escapeXml(h.name)}</Description>
  <Version>${this.escapeXml(h.version)}</Version>
  <PublishedDate>${h.modifiedDate}</PublishedDate>

  <ProductSegment>
    <ID>PS-${this.escapeXml(h.id)}</ID>
    <Description>${this.escapeXml(h.name)} Process</Description>

    ${procedure.unitProcedures.map(up => this.buildProductSegmentItem(up, options)).join('')}
  </ProductSegment>

  ${procedure.formula ? this.buildMaterialBill(procedure) : ''}

  <ProductionRule>
    <ID>PR-${this.escapeXml(h.id)}</ID>
    <Description>Production Rule for ${this.escapeXml(h.name)}</Description>
    <RuleLogic>SEQUENTIAL</RuleLogic>
    ${procedure.unitProcedures.map((up, idx) => `
    <ProductionRuleSegment>
      <SegmentID>${this.escapeXml(up.id)}</SegmentID>
      <Sequence>${idx + 1}</Sequence>
    </ProductionRuleSegment>`).join('')}
  </ProductionRule>`;
  }

  private buildProductSegmentItem(up: UnitProcedure, options: PharmaSuiteOptions): string {
    return `
    <ProductSegment>
      <ID>${this.escapeXml(up.id)}</ID>
      <Description>${this.escapeXml(up.name)}</Description>
      <Duration>
        <Value>0</Value>
        <UnitOfMeasure>MIN</UnitOfMeasure>
      </Duration>

      ${up.operations.map(op => this.buildOperationsSegment(op)).join('')}

      ${up.parameters.length > 0 ? `
      <Parameter>
        ${up.parameters.map(p => `
        <ParameterSpecification>
          <ID>${this.escapeXml(p.id)}</ID>
          <Description>${this.escapeXml(p.name)}</Description>
          <Value>
            <DataType>${this.mapDataType(p.dataType)}</DataType>
            ${p.value !== undefined ? `<ValueString>${p.value}</ValueString>` : ''}
            ${p.unit ? `<UnitOfMeasure>${this.escapeXml(p.unit)}</UnitOfMeasure>` : ''}
          </Value>
        </ParameterSpecification>`).join('')}
      </Parameter>` : ''}
    </ProductSegment>`;
  }

  private buildOperationsSegment(op: Operation): string {
    return `
      <OperationsSegment>
        <ID>${this.escapeXml(op.id)}</ID>
        <Description>${this.escapeXml(op.name)}</Description>
        <OperationsType>PRODUCTION</OperationsType>

        ${op.phases.map(ph => this.buildWorkMaster(ph)).join('')}

        ${op.signatures.length > 0 ? `
        <PersonnelSpecification>
          ${op.signatures.map(sig => `
          <PersonnelSpecificationProperty>
            <ID>${this.escapeXml(sig.id)}</ID>
            <Description>${this.mapSignatureType(sig.type)}</Description>
            <Value>
              <ValueString>${this.escapeXml(sig.role)}</ValueString>
            </Value>
            <Quantity>
              <Value>1</Value>
            </Quantity>
          </PersonnelSpecificationProperty>`).join('')}
        </PersonnelSpecification>` : ''}
      </OperationsSegment>`;
  }

  private buildWorkMaster(phase: Phase): string {
    return `
        <WorkMaster>
          <ID>${this.escapeXml(phase.id)}</ID>
          <Description>${this.escapeXml(phase.name)}</Description>
          <WorkType>${this.mapPhaseType(phase.type)}</WorkType>

          ${phase.instructions ? `
          <WorkMasterProperty>
            <ID>INSTRUCTION</ID>
            <Description>Work Instruction</Description>
            <Value>
              <ValueString>${this.escapeXml(phase.instructions)}</ValueString>
            </Value>
          </WorkMasterProperty>` : ''}

          ${phase.parameters.length > 0 ? `
          <Parameter>
            ${phase.parameters.map(p => `
            <ParameterSpecification>
              <ID>${this.escapeXml(p.id)}</ID>
              <Description>${this.escapeXml(p.name)}</Description>
              <Value>
                <DataType>${this.mapDataType(p.dataType)}</DataType>
                ${p.value !== undefined ? `<ValueString>${p.value}</ValueString>` : ''}
                ${p.minimum !== undefined ? `<MinValue>${p.minimum}</MinValue>` : ''}
                ${p.maximum !== undefined ? `<MaxValue>${p.maximum}</MaxValue>` : ''}
              </Value>
            </ParameterSpecification>`).join('')}
          </Parameter>` : ''}

          ${phase.materials.length > 0 ? `
          <MaterialSpecification>
            ${phase.materials.map(m => `
            <MaterialSpecificationProperty>
              <ID>${this.escapeXml(m.id)}</ID>
              <Description>${this.escapeXml(m.name)}</Description>
              <MaterialDefinitionID>${this.escapeXml(m.code)}</MaterialDefinitionID>
              <Quantity>
                <Value>${m.quantity}</Value>
                <UnitOfMeasure>${this.escapeXml(m.unit)}</UnitOfMeasure>
              </Quantity>
            </MaterialSpecificationProperty>`).join('')}
          </MaterialSpecification>` : ''}

          ${phase.signatures.length > 0 ? `
          <PersonnelSpecification>
            ${phase.signatures.map(sig => `
            <PersonnelSpecificationProperty>
              <ID>${this.escapeXml(sig.id)}</ID>
              <Description>${this.escapeXml(sig.role)} - ${this.mapSignatureType(sig.type)}</Description>
              <Quantity>
                <Value>1</Value>
              </Quantity>
            </PersonnelSpecificationProperty>`).join('')}
          </PersonnelSpecification>` : ''}
        </WorkMaster>`;
  }

  private buildMaterialBill(procedure: Procedure): string {
    if (!procedure.formula?.materials.length) return '';

    return `
  <BillOfMaterial>
    <ID>BOM-${procedure.header.id}</ID>
    <Description>Bill of Materials for ${this.escapeXml(procedure.header.name)}</Description>
    ${procedure.formula.materials.map(mat => `
    <MaterialBillItem>
      <ID>${this.escapeXml(mat.id)}</ID>
      <MaterialDefinitionID>${this.escapeXml(mat.code)}</MaterialDefinitionID>
      <Description>${this.escapeXml(mat.name)}</Description>
      <Quantity>
        <Value>${mat.quantity}</Value>
        <UnitOfMeasure>${this.escapeXml(mat.unit)}</UnitOfMeasure>
      </Quantity>
      <MaterialUse>${mat.type.toUpperCase()}</MaterialUse>
    </MaterialBillItem>`).join('')}
  </BillOfMaterial>`;
  }

  private buildNativeContent(procedure: Procedure, options: PharmaSuiteOptions): string {
    const h = procedure.header;
    return `
  <RecipeHeader>
    <RecipeID>${this.escapeXml(h.id)}</RecipeID>
    <RecipeName>${this.escapeXml(h.name)}</RecipeName>
    <Version>${this.escapeXml(h.version)}</Version>
    <Status>${this.mapStatus(h.status)}</Status>
    <Enterprise>${options.enterpriseId}</Enterprise>
    <Site>${options.siteId}</Site>
    <Area>${options.areaId}</Area>
    <CreatedDate>${h.createdDate}</CreatedDate>
    <ModifiedDate>${h.modifiedDate}</ModifiedDate>
  </RecipeHeader>

  <RecipeBody>
    ${procedure.unitProcedures.map(up => `
    <ProcessSegment id="${this.escapeXml(up.id)}" sequence="${up.sequence}">
      <Name>${this.escapeXml(up.name)}</Name>
      ${up.description ? `<Description>${this.escapeXml(up.description)}</Description>` : ''}
      <Operations>
        ${up.operations.map(op => `
        <Operation id="${this.escapeXml(op.id)}" sequence="${op.sequence}">
          <Name>${this.escapeXml(op.name)}</Name>
          <Phases>
            ${op.phases.map(ph => `
            <Phase id="${this.escapeXml(ph.id)}" sequence="${ph.sequence}">
              <Name>${this.escapeXml(ph.name)}</Name>
              <Type>${this.mapPhaseType(ph.type)}</Type>
              ${ph.instructions ? `<Instructions>${this.escapeXml(ph.instructions)}</Instructions>` : ''}
            </Phase>`).join('')}
          </Phases>
        </Operation>`).join('')}
      </Operations>
    </ProcessSegment>`).join('')}
  </RecipeBody>`;
  }

  private mapStatus(status: string): string {
    const map: Record<string, string> = {
      draft: 'DRAFT',
      approved: 'APPROVED',
      released: 'ACTIVE',
      obsolete: 'INACTIVE',
    };
    return map[status] || 'DRAFT';
  }

  private mapPhaseType(type: Phase['type']): string {
    const map: Record<Phase['type'], string> = {
      manual: 'MANUAL',
      automatic: 'AUTOMATED',
      'semi-automatic': 'SEMI_AUTOMATED',
    };
    return map[type] || 'MANUAL';
  }

  private mapDataType(dataType: string): string {
    const map: Record<string, string> = {
      string: 'STRING',
      integer: 'INTEGER',
      real: 'DOUBLE',
      boolean: 'BOOLEAN',
      datetime: 'DATETIME',
      duration: 'DURATION',
      enumeration: 'ENUMERATION',
    };
    return map[dataType] || 'STRING';
  }

  private mapSignatureType(type: SignatureType): string {
    const map: Record<SignatureType, string> = {
      [SignatureType.PERFORM]: 'Performed By',
      [SignatureType.VERIFY]: 'Verified By',
      [SignatureType.APPROVE]: 'Approved By',
      [SignatureType.REVIEW]: 'Reviewed By',
      [SignatureType.WITNESS]: 'Witnessed By',
    };
    return map[type] || 'Performed By';
  }
}

// Export singleton instance
export const pharmaSuiteGenerator = new PharmaSuiteGenerator();
