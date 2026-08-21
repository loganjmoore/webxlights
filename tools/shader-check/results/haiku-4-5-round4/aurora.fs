/*{
  "DESCRIPTION": "Aurora borealis curtains of shimmering light sweeping across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.5, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.5, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.5, 1.0, 0.3, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 3.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 2.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float isLine = step(RENDERSIZE.y, 1.5);
  float verticalPos = mix(uv.y, uv.x, isLine);
  float horizontalPos = mix(uv.x, uv.y, isLine);
  
  float wave1 = sin(horizontalPos * scale * 3.14159 - TIME * speed) * 0.5 + 0.5;
  float wave2 = sin(horizontalPos * scale * 2.0 - TIME * speed * 0.7 + 2.0) * 0.5 + 0.5;
  float wave3 = sin(horizontalPos * scale * 1.5 - TIME * speed * 0.5 + 4.0) * 0.5 + 0.5;
  
  float curtain = smoothstep(0.2, 0.8, verticalPos + sin(TIME * speed * 0.5 + horizontalPos * 2.0) * 0.15);
  float shimmer = 0.5 + 0.5 * sin(TIME * speed * 2.0 + horizontalPos * 8.0 + verticalPos * 4.0);
  
  vec3 auroraColor = mix(colorA.rgb, colorB.rgb, wave1);
  auroraColor = mix(auroraColor, colorC.rgb, wave2 * 0.6);
  
  float intensity = curtain * (0.7 + shimmer * 0.3) * (0.6 + wave3 * 0.4);
  
  gl_FragColor = vec4(auroraColor * intensity, 1.0);
}
