import { PolicyContext, PolicyContextData } from './PolicyContext';
import { SopPolicy, FinalAction } from './SopPolicy';

export class PolicyMapper {
  static mapAction(aiAction: string, contextData: PolicyContextData): FinalAction {
    const ctx = new PolicyContext({
      ...contextData,
      action: aiAction,
    });

    return SopPolicy.enforce(ctx);
  }
}
