package fr.cobblestar.clientcompat;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

@Mixin(targets = "com.cobblemon.mod.common.client.render.models.blockbench.repository.VaryingModelRepository", remap = false)
abstract class YveltalPoseMixin {
    // Correct the malformed expression from CCC 2.1.0 before Cobblemon parses the pose.
    // All other poses, including an upstream fix or a custom resource pack, pass through.
    @ModifyVariable(method = "loadJsonPoser", at = @At("HEAD"), argsOnly = true, ordinal = 1, remap = false)
    private String cobblestar$repairYveltalFloat(String json, String fileName, String source, Class<?> poserClass) {
        if (!"yveltal".equals(fileName)) return json;
        return json.replace("q.bedrock('yveltal', 'fly_idle'')", "q.bedrock('yveltal', 'fly_idle')");
    }
}
