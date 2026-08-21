/*{
  "DESCRIPTION": "Slow lava lamp blobs flowing smoothly across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 0.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 2.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  vec2 pos = uv * scale;
  
  float blob1 = sin(pos.x + TIME * speed * 0.3) * 0.5 + 0.5;
  blob1 = blob1 * sin(pos.y * 2.0 + TIME * speed * 0.2) * 0.5 + 0.5;
  
  float blob2 = sin(pos.x * 1.5 + TIME * speed * 0.25 + 3.0) * 0.5 + 0.5;
  blob2 = blob2 * sin(pos.y * 1.8 + TIME * speed * 0.15 + 2.0) * 0.5 + 0.5;
  
  float blob3 = sin(pos.x * 0.8 + TIME * speed * 0.35 + 6.0) * 0.5 + 0.5;
  blob3 = blob3 * sin(pos.y * 2.3 + TIME * speed * 0.25 + 4.0) * 0.5 + 0.5;
  
  float combined = max(max(blob1, blob2), blob3);
  combined = smoothstep(0.3, 0.7, combined);
  
  vec3 color = mix(colorA.rgb, colorB.rgb, blob1 * 0.5 + blob2 * 0.3 + blob3 * 0.2);
  
  gl_FragColor = vec4(color * combined, 1.0);
}
