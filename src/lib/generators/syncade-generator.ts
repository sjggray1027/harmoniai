/**
 * Syncade Generator
 *
 * Generates Emerson Syncade MES compatible XML from ISA-88 canonical model.
 * Syncade is widely used in pharmaceutical and biotech manufacturing.
 */

import {
  Procedure,
  UnitProcedure,
  Operation,
  Phase,
  SignatureType,
} from '../models/isa88-canonical';
import { BaseGenerator, GeneratorOptions, GeneratorResult } from './base-generator';

export interface SyncadeOptions extends GeneratorOptions {
  siteId?: string;
  areaId?: string;
  includeWorkflow?: boolean;
  includeEBR?: boolean;
  templateVersion?: string;
}

export class SyncadeGenerator extends BaseGenerator {
  readonly id = 'syncade';
  readonly name = 'Emerson Syncade';
  readonly description = 'Emerson Syncade Manufacturing Execution System';
  readonly vendor = 'Emerson';
  readonly supportedVersions = ['5.0', '5.1', '5.2', '6.0'];

  private readonly defaultNamespace = 'http://www.emerson.com/syncade/recipe';

  generate(procedure: Procedure, options?: SyncadeOptions): GeneratorResult {
    const opts: SyncadeOptions = {
      ...this.getDefaultOptions(),
      ...options,
    };

    const xml = this.buildXml(procedure, opts);
    const stats = this.generateStatistics(procedure);

    return {
      content: opts.prettyPrint ? this.formatXml(xml) : xml,
      format: 'Syncade Recipe XML',
      mimeType: 'application/xml',
      fileExtension: 'xml',
      metadata: {
        generator: this.id,
        version: opts.targetVersion || '5.2',
        generatedAt: new Date().toISOString(),
        procedureName: procedure.header.name,
        statistics: stats,
      },
    };
  }

  getDefaultOptions(): SyncadeOptions {
    return {
      ...super.getDefaultOptions(),
      siteId: 'SITE-001',
      areaId: 'AREA-001',
      includeWorkflow: true,
      includeEBR: true,
      templateVersion: '5.2',
    };
  }

  private buildXml(procedure: Procedure, options: SyncadeOptions): string {
    const parts: string[] = [];

    // XML Declaration
    parts.push(`<?xml version="1.0" encoding="${options.encoding || 'UTF-8'}"?>`);

    // Root element
    parts.push(`<SyncadeRecipe xmlns="${this.defaultNamespace}" version="${options.templateVersion}">`);

    // Recipe Definition
    parts.push(this.buildRecipeDefinition(procedure, options));

    // Workflow Definition (Syncade-specific)
    if (options.includeWorkflow) {
      parts.push(this.buildWorkflowDefinition(procedure));
    }

    // EBR Template
    if (options.includeEBR) {
      parts.push(this.buildEBRTemplate(procedure, options));
    }

    // Close root
    parts.push('</SyncadeRecipe>');

    return parts.join('\n');
  }

  private buildRecipeDefinition(procedure: Procedure, options: SyncadeOptions): string {
    const h = procedure.header;
    return `
  <RecipeDefinition>
    <Header>
      <RecipeID>${this.escapeXml(h.id)}</RecipeID>
      <RecipeName>${this.escapeXml(h.name)}</RecipeName>
      <Version>${this.escapeXml(h.version)}</Version>
      <Status>${this.mapStatus(h.status)}</Status>
      <SiteID>${options.siteId}</SiteID>
      <AreaID>${options.areaId}</AreaID>
      ${h.productCode ? `<ProductCode>${this.escapeXml(h.productCode)}</ProductCode>` : ''}
      ${h.productName ? `<ProductName>${this.escapeXml(h.productName)}</ProductName>` : ''}
      ${h.description ? `<Description>${this.escapeXml(h.description)}</Description>` : ''}
      <CreatedDate>${h.createdDate}</CreatedDate>
      <ModifiedDate>${h.modifiedDate}</ModifiedDate>
      ${h.author ? `<CreatedBy>${this.escapeXml(h.author)}</CreatedBy>` : ''}
    </Header>

    <ProcessSegments>
      ${procedure.unitProcedures.map(up => this.buildProcessSegment(up)).join('')}
    </ProcessSegments>

    ${procedure.formula ? this.buildBillOfMaterials(procedure) : ''}
  </RecipeDefinition>`;
  }

  private buildProcessSegment(up: UnitProcedure): string {
    return `
      <ProcessSegment id="${this.escapeXml(up.id)}">
        <Name>${this.escapeXml(up.name)}</Name>
        <Sequence>${up.sequence}</Sequence>
        ${up.description ? `<Description>${this.escapeXml(up.description)}</Description>` : ''}
        <ProcessOperations>
          ${up.operations.map(op => this.buildProcessOperation(op)).join('')}
        </ProcessOperations>
      </ProcessSegment>`;
  }

  private buildProcessOperation(op: Operation): string {
    return `
          <ProcessOperation id="${this.escapeXml(op.id)}">
            <Name>${this.escapeXml(op.name)}</Name>
            <Sequence>${op.sequence}</Sequence>
            ${op.description ? `<Description>${this.escapeXml(op.description)}</Description>` : ''}
            <ProcessActions>
              ${op.phases.map(ph => this.buildProcessAction(ph)).join('')}
            </ProcessActions>
            ${op.signatures.length > 0 ? `
            <SignatureRequirements>
              ${op.signatures.map(sig => this.buildSignatureRequirement(sig)).join('')}
            </SignatureRequirements>` : ''}
          </ProcessOperation>`;
  }

  private buildProcessAction(phase: Phase): string {
    return `
              <ProcessAction id="${this.escapeXml(phase.id)}">
                <Name>${this.escapeXml(phase.name)}</Name>
                <Sequence>${phase.sequence}</Sequence>
                <ActionType>${this.mapPhaseType(phase.type)}</ActionType>
                ${phase.instructions ? `<WorkInstruction>${this.escapeXml(phase.instructions)}</WorkInstruction>` : ''}
                ${phase.parameters.length > 0 ? `
                <ProcessParameters>
                  ${phase.parameters.map(p => `
                  <Parameter name="${this.escapeXml(p.name)}" dataType="${p.dataType}">
                    ${p.value !== undefined ? `<TargetValue>${p.value}</TargetValue>` : ''}
                    ${p.unit ? `<UOM>${this.escapeXml(p.unit)}</UOM>` : ''}
                    ${p.minimum !== undefined ? `<LowerLimit>${p.minimum}</LowerLimit>` : ''}
                    ${p.maximum !== undefined ? `<UpperLimit>${p.maximum}</UpperLimit>` : ''}
                  </Parameter>`).join('')}
                </ProcessParameters>` : ''}
                ${phase.materials.length > 0 ? `
                <MaterialConsumption>
                  ${phase.materials.map(m => `
                  <Material code="${this.escapeXml(m.code)}">
                    <Quantity>${m.quantity}</Quantity>
                    <UOM>${this.escapeXml(m.unit)}</UOM>
                  </Material>`).join('')}
                </MaterialConsumption>` : ''}
                ${phase.signatures.length > 0 ? `
                <ESignatures>
                  ${phase.signatures.map(sig => this.buildSignatureRequirement(sig)).join('')}
                </ESignatures>` : ''}
              </ProcessAction>`;
  }

  private buildSignatureRequirement(sig: Phase['signatures'][0]): string {
    return `
                  <SignatureRequirement>
                    <Type>${this.mapSignatureType(sig.type)}</Type>
                    <Role>${this.escapeXml(sig.role)}</Role>
                    <Sequence>${sig.order}</Sequence>
                    <Required>${sig.required}</Required>
                    ${sig.meaning ? `<Meaning>${this.escapeXml(sig.meaning)}</Meaning>` : ''}
                  </SignatureRequirement>`;
  }

  private buildBillOfMaterials(procedure: Procedure): string {
    if (!procedure.formula?.materials.length) return '';

    return `
    <BillOfMaterials>
      ${procedure.formula.materials.map(mat => `
      <MaterialItem>
        <MaterialCode>${this.escapeXml(mat.code)}</MaterialCode>
        <MaterialName>${this.escapeXml(mat.name)}</MaterialName>
        <Quantity>${mat.quantity}</Quantity>
        <UOM>${this.escapeXml(mat.unit)}</UOM>
        <MaterialType>${mat.type.toUpperCase()}</MaterialType>
        <Scalable>${mat.scalable}</Scalable>
      </MaterialItem>`).join('')}
    </BillOfMaterials>`;
  }

  private buildWorkflowDefinition(procedure: Procedure): string {
    return `
  <WorkflowDefinition>
    <WorkflowID>WF-${procedure.header.id}</WorkflowID>
    <WorkflowName>${this.escapeXml(procedure.header.name)} Workflow</WorkflowName>
    <States>
      <State id="CREATED" initial="true">Created</State>
      <State id="INPROGRESS">In Progress</State>
      <State id="PAUSED">Paused</State>
      <State id="COMPLETE">Complete</State>
      <State id="CANCELLED">Cancelled</State>
    </States>
    <Transitions>
      <Transition from="CREATED" to="INPROGRESS" event="START"/>
      <Transition from="INPROGRESS" to="PAUSED" event="PAUSE"/>
      <Transition from="PAUSED" to="INPROGRESS" event="RESUME"/>
      <Transition from="INPROGRESS" to="COMPLETE" event="COMPLETE"/>
      <Transition from="INPROGRESS" to="CANCELLED" event="CANCEL"/>
      <Transition from="PAUSED" to="CANCELLED" event="CANCEL"/>
    </Transitions>
  </WorkflowDefinition>`;
  }

  private buildEBRTemplate(procedure: Procedure, options: SyncadeOptions): string {
    return `
  <EBRTemplate>
    <TemplateID>EBR-${procedure.header.id}</TemplateID>
    <TemplateName>${this.escapeXml(procedure.header.name)} EBR</TemplateName>
    <TemplateVersion>${options.templateVersion}</TemplateVersion>
    <Sections>
      ${procedure.unitProcedures.map((up, idx) => `
      <Section sequence="${idx + 1}">
        <SectionID>${this.escapeXml(up.id)}</SectionID>
        <SectionName>${this.escapeXml(up.name)}</SectionName>
        <Instructions>
          ${up.operations.flatMap(op => op.phases).map((ph, phIdx) => `
          <Instruction sequence="${phIdx + 1}">
            <InstructionID>${this.escapeXml(ph.id)}</InstructionID>
            <InstructionText>${this.escapeXml(ph.instructions || ph.name)}</InstructionText>
            <ActionType>${this.mapPhaseType(ph.type)}</ActionType>
          </Instruction>`).join('')}
        </Instructions>
      </Section>`).join('')}
    </Sections>
    <AuditTrail enabled="true">
      <Events>
        <Event type="CREATE">Record Created</Event>
        <Event type="MODIFY">Record Modified</Event>
        <Event type="SIGN">Electronic Signature Applied</Event>
        <Event type="COMPLETE">Record Completed</Event>
      </Events>
    </AuditTrail>
  </EBRTemplate>`;
  }

  private mapStatus(status: string): string {
    const map: Record<string, string> = {
      draft: 'DRAFT',
      approved: 'APPROVED',
      released: 'RELEASED',
      obsolete: 'OBSOLETE',
    };
    return map[status] || 'DRAFT';
  }

  private mapPhaseType(type: Phase['type']): string {
    const map: Record<Phase['type'], string> = {
      manual: 'MANUAL',
      automatic: 'AUTOMATIC',
      'semi-automatic': 'SEMI_AUTOMATIC',
    };
    return map[type] || 'MANUAL';
  }

  private mapSignatureType(type: SignatureType): string {
    const map: Record<SignatureType, string> = {
      [SignatureType.PERFORM]: 'PERFORMED_BY',
      [SignatureType.VERIFY]: 'VERIFIED_BY',
      [SignatureType.APPROVE]: 'APPROVED_BY',
      [SignatureType.REVIEW]: 'REVIEWED_BY',
      [SignatureType.WITNESS]: 'WITNESSED_BY',
    };
    return map[type] || 'PERFORMED_BY';
  }
}

// Export singleton instance
export const syncadeGenerator = new SyncadeGenerator();
