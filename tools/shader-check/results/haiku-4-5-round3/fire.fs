/*{
  "DESCRIPTION": "Fire rising from the bottom with flickering flames",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorBase", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorTip", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "height", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.8 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float isLine = step(RENDERSIZE.y, 1.5);
  float animPos = uv.x - TIME * speed * 0.25;
  float vertPos = mix(uv.y, uv.x, isLine);
  
  float flame = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float wave = sin(animPos * 3.14159 + fi * 0.785) * 0.5 + 0.5;
    float freq = 2.0 + fi * 0.5;
    float noise = sin(animPos * freq + fi * 1.234 + TIME * speed) * 0.5 + 0.5;
    float flicker = sin(TIME * speed * 2.0 + fi) * 0.3 + 0.7;
    
    float yOffset = wave * 0.3 + noise * 0.2;
    float firePos = vertPos - yOffset;
    float falloff = exp(-firePos * firePos * 8.0) * flicker;
    flame += falloff;
  }
  
  flame = clamp(flame * 0.5, 0.0, 1.0);
  float fireFade = smoothstep(height + 0.2, 0.0, vertPos);
  flame *= fireFade;
  
  vec3 fireColor = mix(colorBase.rgb, colorTip.rgb, flame);
  gl_FragColor = vec4(fireColor, 1.0);
}
