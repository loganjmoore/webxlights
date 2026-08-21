/*{
  "DESCRIPTION": "Colored light chase running horizontally along the roofline",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "spacing", "TYPE": "float", "MIN": 0.05, "MAX": 0.5, "DEFAULT": 0.2 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  
  float roofY = uv.y;
  if (RENDERSIZE.y < 2.0) {
    roofY = uv.x;
  }
  
  float chasePos = fract((uv.x - TIME * speed * 0.25) / spacing);
  float beacon = smoothstep(0.15, 0.0, abs(chasePos - 0.5));
  
  vec3 light = mix(colorA.rgb, colorB.rgb, step(0.5, chasePos));
  light = mix(light, colorC.rgb, step(0.75, chasePos));
  
  vec3 finalColor = light * beacon;
  
  gl_FragColor = vec4(finalColor, 1.0);
}
