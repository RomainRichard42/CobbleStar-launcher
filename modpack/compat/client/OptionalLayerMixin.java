package fr.cobblestar.clientcompat;

import com.cobblemon.mod.common.client.render.ModelAssetVariation;
import com.cobblemon.mod.common.client.render.ModelLayer;
import com.cobblemon.mod.common.client.render.StaticModelTextureSupplier;
import com.cobblemon.mod.common.client.render.models.blockbench.repository.VaryingModelRepository;
import java.util.List;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.packs.resources.ResourceManager;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(value = VaryingModelRepository.class, remap = false)
abstract class OptionalLayerMixin {
    @Inject(method = "registerVariations", at = @At("RETURN"))
    private void cobblestar$checkOptionalLayers(ResourceManager resources, CallbackInfo ci) {
        var species = VaryingModelRepository.INSTANCE.getVariations();
        for (String name : List.of("aegislash", "comfey", "doublade", "flabebe", "floette",
                "florges", "honedge", "meganium", "roselia", "roserade", "vivillon")) {
            var resolver = species.get(ResourceLocation.fromNamespaceAndPath("cobblemon", name));
            if (resolver == null) continue;
            var entries = resolver.getVariations().listIterator();
            while (entries.hasNext()) {
                var variant = entries.next();
                var layers = variant.getLayers();
                if (layers == null || layers.isEmpty()) continue;
                // Resolve only static optional assets, once per resource reload. An installed expansion wins.
                List<ModelLayer> available = layers.stream().filter(layer -> !layer.getEnabled()
                        || !(layer.getTexture() instanceof StaticModelTextureSupplier file)
                        || resources.getResource(file.getTexture()).isPresent()).toList();
                if (available.size() == layers.size()) continue;
                // Omitting this layer preserves the last valid layer of the same name and the base texture.
                entries.set(new ModelAssetVariation(variant.getAspects(), variant.getCondition(), variant.getPoser(),
                        variant.getModel(), variant.getTexture(), available, variant.getSprites()));
            }
        }
    }
}
