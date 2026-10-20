import {
	CircuitComponent,
	FlowchartConnectorComponent,
	FlowchartDatabaseComponent,
	FlowchartDecisionComponent,
	FlowchartDocumentComponent,
	FlowchartInputOutputComponent,
	FlowchartOffPageConnectorComponent,
	FlowchartSubprocessComponent,
	FlowchartTerminatorComponent,
	RectangleComponent,
	WireComponent,
	type FlowchartComponentKind,
} from "../internal"

export function createFlowchartComponent(kind: FlowchartComponentKind): CircuitComponent {
	switch (kind) {
		case "terminator":
			return new FlowchartTerminatorComponent()
		case "process": {
			const component = new RectangleComponent(false)
			component.displayName = "Process"
			return component
		}
		case "decision":
			return new FlowchartDecisionComponent()
		case "inputOutput":
			return new FlowchartInputOutputComponent()
		case "document":
			return new FlowchartDocumentComponent()
		case "database":
			return new FlowchartDatabaseComponent()
		case "subprocess":
			return new FlowchartSubprocessComponent()
		case "connector":
			return new FlowchartConnectorComponent()
		case "offPageConnector":
			return new FlowchartOffPageConnectorComponent()
		case "flowArrow": {
			const component = new WireComponent(false, true)
			component.displayName = "Flow Arrow"
			return component
		}
		default:
			throw new Error(`Unsupported flowchart component kind: ${kind}`)
	}
}
