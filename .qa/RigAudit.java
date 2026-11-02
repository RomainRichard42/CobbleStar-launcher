package qa;
import com.cobblemon.mod.common.client.render.models.blockbench.FloatingState;
import com.cobblemon.mod.common.client.render.models.blockbench.repository.VaryingModelRepository;
import com.google.gson.*;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.resources.ResourceLocation;
import java.nio.file.*;
import java.util.*;
import java.io.*;
public class RigAudit implements ClientModInitializer {
    boolean finished;
    static final Gson G=new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
    static String msg(Throwable e){StringBuilder s=new StringBuilder();for(var cause=e;cause!=null;cause=cause.getCause()){s.append(cause.getClass().getSimpleName()).append(": ").append(cause.getMessage()).append(" | ");}return s.toString();}
    static void record(Map<String,JsonObject> issues, String kind,String species,String model,String poser,Set<String> aspects,String problem,Throwable thrown) {
        var key=String.join(" ",kind,species,model,poser,problem);
        var row=issues.get(key);
        if(row==null){row=new JsonObject();row.addProperty("kind",kind);row.addProperty("species",species);row.addProperty("model",model);row.addProperty("poser",poser);row.add("aspects",G.toJsonTree(aspects));row.addProperty("detail",problem);row.addProperty("count",0);
            if(thrown!=null){var sw=new StringWriter();thrown.printStackTrace(new PrintWriter(sw));row.addProperty("trace",sw.toString().substring(0,Math.min(sw.toString().length(),5500)));}
            issues.put(key,row);}
        row.addProperty("count",row.get("count").getAsInt()+1);
    }
    @Override public void onInitializeClient(){ClientTickEvents.END_CLIENT_TICK.register(mc->{
        if(finished || mc.screen==null || mc.getOverlay()!=null)return;
        finished=true;
        var dst=mc.gameDirectory.toPath();var report=new JsonObject();
        try {
            var mgr=mc.getResourceManager();var repo=VaryingModelRepository.INSTANCE;var species=new TreeSet<String>();
            for(var entry:mgr.listResources("bedrock/pokemon/resolvers",k->k.getPath().endsWith(".json")).entrySet()){
                try(var reader=entry.getValue().openAsReader()){var file=JsonParser.parseReader(reader).getAsJsonObject(); if(file.has("species"))species.add(ResourceLocation.parse(file.get("species").getAsString()).toString());}
            }
            var issues=new LinkedHashMap<String,JsonObject>();var pairs=new HashSet<String>();int states=0,conditional=0; var sources=new TreeMap<String,String>(); var declarations=new TreeMap<String,Set<String>>();
            var folders=List.of("bedrock/pokemon/resolvers","bedrock/pokemon/models","bedrock/pokemon/posers");
            for(var folder:folders){for(var e:mgr.listResources(folder,k->k.getPath().endsWith(".json")).entrySet())sources.put(e.getKey().toString(),e.getValue().sourcePackId());}
            report.add("activePacks",G.toJsonTree(mgr.listPacks().map(p->p.packId()).toList()));
            for(String id:species){
                if(id.endsWith(":metagross")||id.endsWith(":yveltal"))System.out.println("[RIG-START] "+id);
                var key=ResourceLocation.parse(id);var resolver=repo.getVariations().get(key);
                if(resolver==null){record(issues,"NO_RESOLVER",id,"","",Set.of(),"missing entry",null);continue;}
                var combinations=new LinkedHashSet<Set<String>>();combinations.add(Set.of());
                for(var v:resolver.getVariations()){combinations.add(new TreeSet<>(v.getAspects()));if(v.getCondition()!=null)conditional++;}
                for(var base:new ArrayList<>(combinations)){
                    for(String gender:List.of("","male","female"))for(boolean shiny:List.of(false,true)){
                        if(gender.equals("female")&&base.contains("male")||gender.equals("male")&&base.contains("female"))continue;
                        var a=new TreeSet<>(base);if(!gender.isEmpty())a.add(gender);if(shiny)a.add("shiny");combinations.add(a);
                    }
                }
                boolean alpha=resolver.getVariations().stream().anyMatch(v->v.getAspects().contains("alpha_eyes"));
                boolean star=resolver.getVariations().stream().anyMatch(v->v.getAspects().contains("cobblestar-star"));
                for(String extra:List.of("alpha_eyes","cobblestar-star")){
                    if(extra.equals("alpha_eyes")&&!alpha||extra.equals("cobblestar-star")&&!star)continue;
                    for(var base:new ArrayList<>(combinations)){var a=new TreeSet<>(base);a.add(extra);combinations.add(a);}
                }
                var values=new TreeSet<String>();
                for(var asp:combinations){
                    states++;
                    var state=new FloatingState();state.setCurrentAspects(asp);
                    String model="",poser="";
                    try{
                        model=String.valueOf(resolver.getResolvedModel(state));poser=String.valueOf(resolver.getResolvedPoser(state));pairs.add(model+" "+poser);values.add(model+" "+poser);
                        resolver.getPoser(state);
                    }catch(Exception ex){
                        try{repo.getPoser(key,state);record(issues,"FALLBACK",id,model,poser,asp,msg(ex),ex);}
                        catch(Exception fatal){record(issues,"CRASH",id,model,poser,asp,msg(fatal),fatal);}
                    }
                    try{
                        var texture=resolver.getResolvedTexture(state);
                        if(texture==null||mgr.getResource(texture).isEmpty())record(issues,"TEXTURE",id,model,poser,asp,String.valueOf(texture),null);
                    }catch(Exception e){record(issues,"TEXTURE_ERROR",id,model,poser,asp,msg(e),e);}
                    try{
                        for(var layer:resolver.getResolvedLayers(state)){
                            if(!layer.getEnabled()||layer.getTexture()==null)continue;
                            var texture=layer.getTexture().invoke(state);
                            if(texture!=null&&mgr.getResource(texture).isEmpty())record(issues,"LAYER",id,model,poser,asp,layer.getName()+" "+texture,null);
                        }
                    }catch(Exception e){record(issues,"LAYER_ERROR",id,model,poser,asp,msg(e),e);}
                }
                declarations.put(id,values);
                if(id.endsWith(":metagross")||id.endsWith(":yveltal"))System.out.println("[RIG-END] "+id);
                resolver.getPosers().clear();
            }
            report.addProperty("species",species.size());report.addProperty("states",states);report.addProperty("rigPairs",pairs.size());report.addProperty("conditionalDeclarations",conditional);
            report.add("issues",G.toJsonTree(issues.values()));Files.writeString(dst.resolve("report.json"),G.toJson(report));Files.writeString(dst.resolve("sources.json"),G.toJson(sources));Files.writeString(dst.resolve("pairs.json"),G.toJson(declarations));
            Files.writeString(dst.resolve("probe-result.txt"),"PASS audit ran: "+species.size()+" species, "+states+" states, "+issues.size()+" issue groups.");
        }catch(Throwable e){e.printStackTrace();try{Files.writeString(dst.resolve("probe-result.txt"),"FAIL: "+e);}catch(Exception ignored){}}
        mc.stop();
    });}
}
