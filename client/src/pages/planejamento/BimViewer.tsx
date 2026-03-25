import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as WebIFC from "web-ifc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload, Loader2, Box, Eye, EyeOff, Maximize, Grid3X3,
  ChevronRight, ChevronDown, Trash2, Layers, Palette, Info,
  MousePointer2, Link2, X, Check, Search,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const ELEMENT_TYPES: Record<number, { label: string; color: string }> = {
  [WebIFC.IFCBEAM]:        { label: "Vigas",       color: "#828282" },
  [WebIFC.IFCCOLUMN]:      { label: "Pilares",     color: "#6B8E23" },
  [WebIFC.IFCSLAB]:        { label: "Lajes",       color: "#A0A0A0" },
  [WebIFC.IFCFOOTING]:     { label: "Fundações",   color: "#8B7355" },
  [WebIFC.IFCWALL]:        { label: "Paredes",     color: "#CD853F" },
  [WebIFC.IFCWALLSTANDARDCASE]: { label: "Paredes", color: "#CD853F" },
  [WebIFC.IFCMEMBER]:      { label: "Membros",     color: "#708090" },
  [WebIFC.IFCPLATE]:       { label: "Placas",      color: "#B0C4DE" },
  [WebIFC.IFCROOF]:        { label: "Telhados",    color: "#8B4513" },
  [WebIFC.IFCSTAIR]:       { label: "Escadas",     color: "#D2691E" },
  [WebIFC.IFCSTAIRFLIGHT]: { label: "Escadas",     color: "#D2691E" },
  [WebIFC.IFCRAILING]:     { label: "Guarda-corpos", color: "#696969" },
  [WebIFC.IFCWINDOW]:      { label: "Janelas",     color: "#87CEEB" },
  [WebIFC.IFCDOOR]:        { label: "Portas",      color: "#DEB887" },
};

interface IfcModel {
  id: string;
  dbId?: number;
  name: string;
  discipline: string;
  meshes: THREE.Mesh[];
  visible: boolean;
  storeys: StoreyInfo[];
  elementCount: number;
}

interface StoreyInfo {
  name: string;
  elevation: number;
  expressId: number;
  elements: ElementInfo[];
  visible: boolean;
}

interface ElementInfo {
  expressId: number;
  type: string;
  name: string;
  storey: string;
}

const DISCIPLINES = [
  "Estrutural",
  "Arquitetura",
  "Hidráulica",
  "Elétrica",
  "HVAC",
  "Fundações",
  "Outros",
];

interface Props {
  projetoId: number;
  projetoNome: string;
  companyId: number;
}

export default function BimViewer({ projetoId, projetoNome, companyId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameRef = useRef<number>(0);
  const ifcApiRef = useRef<WebIFC.IfcAPI | null>(null);

  const [models, setModels] = useState<IfcModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [importDiscipline, setImportDiscipline] = useState("Estrutural");
  const [viewFilter, setViewFilter] = useState<string>("Todas");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);
  const [expandedStoreys, setExpandedStoreys] = useState<Set<string>>(new Set());
  const [showGrid, setShowGrid] = useState(true);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const [selectedMeshes, setSelectedMeshes] = useState<Set<THREE.Mesh>>(new Set());
  const [linkPanelOpen, setLinkPanelOpen] = useState(false);
  const [activitySearch, setActivitySearch] = useState("");
  const [boxSelecting, setBoxSelecting] = useState(false);
  const [boxStart, setBoxStart] = useState<{ x: number; y: number } | null>(null);
  const [boxEnd, setBoxEnd] = useState<{ x: number; y: number } | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const originalMaterialsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());
  const initRef = useRef(false);
  const savedModelsLoadedRef = useRef(false);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  const uploadMutation = trpc.bim.uploadModel.useMutation();
  const deleteMutation = trpc.bim.deleteModel.useMutation();
  const saveLinkMutation = trpc.bim.saveLink.useMutation();
  const deleteLinkMutation = trpc.bim.deleteLink.useMutation();
  const { data: savedModels } = trpc.bim.listModels.useQuery(
    { projetoId, companyId },
    { enabled: !!companyId && !!projetoId }
  );
  const { data: bimLinks, refetch: refetchLinks } = trpc.bim.listLinks.useQuery(
    { projetoId, companyId },
    { enabled: !!companyId && !!projetoId }
  );
  const { data: bimAtividades } = trpc.bim.listAtividades.useQuery(
    { projetoId, companyId },
    { enabled: !!projetoId && !!companyId }
  );

  const parseIfcBuffer = useCallback(async (
    data: Uint8Array,
    name: string,
    discipline: string,
  ): Promise<IfcModel | null> => {
    const api = await initIfcApi();
    const modelID = api.OpenModel(data);
    const storeys = extractStoreys(api, modelID);
    const elements = extractElements(api, modelID);

    storeys.forEach(st => {
      st.elements = elements.filter(el =>
        el.storey === st.name || el.storey === st.elevation.toString()
      );
    });
    const unassigned = elements.filter(el => !el.storey);
    if (unassigned.length > 0 && storeys.length > 0) {
      storeys[0].elements.push(...unassigned);
    }

    if (!sceneRef.current) return null;

    const meshes = createMeshesFromIFC(api, modelID, sceneRef.current);
    const scaleFactor = 0.01;
    meshes.forEach(m => m.scale.set(scaleFactor, scaleFactor, scaleFactor));
    api.CloseModel(modelID);

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      discipline,
      meshes,
      visible: true,
      storeys,
      elementCount: elements.length,
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || initRef.current) return;
    initRef.current = true;

    const container = containerRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f4f8);

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 10000);
    camera.position.set(30, 20, 30);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = true;
    controls.minDistance = 1;
    controls.maxDistance = 500;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 50, 50);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const hemiLight = new THREE.HemisphereLight(0xddeeff, 0x0f0e0d, 0.4);
    scene.add(hemiLight);

    const gridHelper = new THREE.GridHelper(100, 100, 0xcccccc, 0xe0e0e0);
    gridRef.current = gridHelper;
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animFrameRef.current);

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      scene.clear();

      renderer.dispose();
      controls.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      if (ifcApiRef.current) {
        try { (ifcApiRef.current as any).Dispose?.(); } catch {}
        ifcApiRef.current = null;
      }

      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      initRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (linkPanelOpen) {
          setLinkPanelOpen(false);
        } else if (selectedMeshes.size > 0) {
          clearSelection();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedMeshes, linkPanelOpen]);

  useEffect(() => {
    models.forEach(m => {
      const shouldShow = viewFilter === "Todas" || m.discipline === viewFilter;
      if (m.visible !== shouldShow) {
        m.meshes.forEach(mesh => { mesh.visible = shouldShow; });
        m.visible = shouldShow;
      }
    });
    setModels(prev => prev.map(m => ({
      ...m,
      visible: viewFilter === "Todas" || m.discipline === viewFilter,
    })));
  }, [viewFilter]);

  useEffect(() => {
    if (!savedModels || savedModels.length === 0 || savedModelsLoadedRef.current) return;
    if (!sceneRef.current) return;
    savedModelsLoadedRef.current = true;

    const loadAll = async () => {
      setLoading(true);
      setLoadingMsg(`Carregando ${savedModels.length} modelo(s) salvo(s)...`);
      const loaded: IfcModel[] = [];

      for (const sm of savedModels) {
        try {
          setLoadingMsg(`Baixando "${sm.nome}"...`);
          const resp = await fetch(`/uploads/${sm.arquivoPath}`);
          if (!resp.ok) {
            console.warn(`Não foi possível baixar modelo ${sm.nome}: ${resp.status}`);
            continue;
          }
          const buf = await resp.arrayBuffer();
          setLoadingMsg(`Processando "${sm.nome}"...`);
          const model = await parseIfcBuffer(new Uint8Array(buf), sm.nome, sm.disciplina);
          if (model) {
            model.dbId = sm.id;
            loaded.push(model);
          }
        } catch (err) {
          console.error(`Erro carregando modelo salvo ${sm.nome}:`, err);
        }
      }

      if (loaded.length > 0) {
        setModels(loaded);
        setTimeout(() => {
          const meshes = loaded.flatMap(m => m.meshes).filter(m => m.visible);
          if (meshes.length > 0) fitCameraToModel(meshes);
        }, 300);
        toast.success(`${loaded.length} modelo(s) carregado(s) do servidor`);
      }

      setLoading(false);
      setLoadingMsg("");
    };

    loadAll();
  }, [savedModels, companyId, parseIfcBuffer]);

  const initIfcApi = async () => {
    if (ifcApiRef.current) return ifcApiRef.current;
    const api = new WebIFC.IfcAPI();
    api.SetWasmPath("/");
    await api.Init();
    ifcApiRef.current = api;
    return api;
  };

  const extractStoreys = (api: WebIFC.IfcAPI, modelID: number): StoreyInfo[] => {
    const storeys: StoreyInfo[] = [];
    try {
      const storeyIds = api.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY);
      for (let i = 0; i < storeyIds.size(); i++) {
        const id = storeyIds.get(i);
        const storey = api.GetLine(modelID, id);
        const name = storey.Name?.value || `Pavimento ${i + 1}`;
        const elevation = storey.Elevation?.value || 0;
        storeys.push({
          name,
          elevation,
          expressId: id,
          elements: [],
          visible: true,
        });
      }
    } catch (e) {
      console.warn("Error extracting storeys:", e);
    }
    return storeys.sort((a, b) => a.elevation - b.elevation);
  };

  const extractElements = (api: WebIFC.IfcAPI, modelID: number): ElementInfo[] => {
    const elements: ElementInfo[] = [];
    for (const [typeId, info] of Object.entries(ELEMENT_TYPES)) {
      try {
        const ids = api.GetLineIDsWithType(modelID, Number(typeId));
        for (let i = 0; i < ids.size(); i++) {
          const expressId = ids.get(i);
          const el = api.GetLine(modelID, expressId);
          const name = el.Name?.value || info.label;

          let storey = "";
          try {
            const props = api.GetLine(modelID, expressId, true);
            if (props) {
              const psets = api.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
              for (let j = 0; j < psets.size(); j++) {
                const rel = api.GetLine(modelID, psets.get(j));
                const relatedObjects = rel.RelatedObjects;
                if (relatedObjects) {
                  for (let k = 0; k < relatedObjects.length; k++) {
                    if (relatedObjects[k]?.value === expressId) {
                      const pset = api.GetLine(modelID, rel.RelatingPropertyDefinition.value);
                      if (pset.HasProperties) {
                        for (let p = 0; p < pset.HasProperties.length; p++) {
                          const prop = api.GetLine(modelID, pset.HasProperties[p].value);
                          if (prop.Name?.value === "Planta" || prop.Name?.value === "Piso") {
                            storey = prop.NominalValue?.value?.toString() || "";
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          } catch {}

          elements.push({
            expressId,
            type: info.label,
            name,
            storey,
          });
        }
      } catch (e) {
        console.warn(`Error extracting ${info.label}:`, e);
      }
    }
    return elements;
  };

  const createMeshesFromIFC = (api: WebIFC.IfcAPI, modelID: number, scene: THREE.Scene): THREE.Mesh[] => {
    const meshes: THREE.Mesh[] = [];
    api.StreamAllMeshes(modelID, (mesh) => {
      const placedGeometries = mesh.geometries;
      for (let i = 0; i < placedGeometries.size(); i++) {
        const pg = placedGeometries.get(i);
        const geometry = api.GetGeometry(modelID, pg.geometryExpressID);
        const verts = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
        const indices = api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());

        const bufferGeometry = new THREE.BufferGeometry();
        const posFloats = new Float32Array(verts.length / 2);
        const normFloats = new Float32Array(verts.length / 2);

        for (let j = 0; j < verts.length; j += 6) {
          posFloats[j / 2] = verts[j];
          posFloats[j / 2 + 1] = verts[j + 1];
          posFloats[j / 2 + 2] = verts[j + 2];
          normFloats[j / 2] = verts[j + 3];
          normFloats[j / 2 + 1] = verts[j + 4];
          normFloats[j / 2 + 2] = verts[j + 5];
        }

        bufferGeometry.setAttribute("position", new THREE.BufferAttribute(posFloats, 3));
        bufferGeometry.setAttribute("normal", new THREE.BufferAttribute(normFloats, 3));
        bufferGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

        const col = pg.color;
        const color = new THREE.Color(col.x, col.y, col.z);
        const material = new THREE.MeshPhongMaterial({
          color,
          opacity: col.w,
          transparent: col.w < 1,
          side: THREE.DoubleSide,
          specular: new THREE.Color(0x222222),
          shininess: 30,
        });

        const m = new THREE.Mesh(bufferGeometry, material);
        const matrix = new THREE.Matrix4();
        matrix.fromArray(pg.flatTransformation);
        m.applyMatrix4(matrix);
        m.userData.expressID = mesh.expressID;

        scene.add(m);
        meshes.push(m);

        geometry.delete();
      }
    });
    return meshes;
  };

  const fitCameraToModel = (meshes: THREE.Mesh[]) => {
    if (!cameraRef.current || !controlsRef.current || meshes.length === 0) return;

    const box = new THREE.Box3();
    meshes.forEach(m => box.expandByObject(m));

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 1.5;

    cameraRef.current.position.set(
      center.x + distance * 0.7,
      center.y + distance * 0.5,
      center.z + distance * 0.7
    );
    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".ifc")) {
      toast.error("Apenas arquivos .ifc são suportados");
      return;
    }

    if (file.size > 35 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 35MB)");
      return;
    }

    setLoading(true);
    setLoadingMsg("Lendo arquivo...");

    try {
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      const modelName = file.name.replace(/\.ifc$/i, "");

      setLoadingMsg("Processando modelo 3D...");
      const model = await parseIfcBuffer(data, modelName, importDiscipline);

      if (!model) {
        toast.error("Cena 3D não inicializada");
        return;
      }

      setLoadingMsg("Ajustando câmera...");
      fitCameraToModel(model.meshes);

      setLoadingMsg("Salvando no servidor...");
      const arrayToBase64 = (arr: Uint8Array): string => {
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < arr.length; i += chunkSize) {
          binary += String.fromCharCode(...arr.slice(i, i + chunkSize));
        }
        return btoa(binary);
      };
      const fileBase64 = arrayToBase64(data);

      try {
        const result = await uploadMutation.mutateAsync({
          projetoId,
          companyId,
          nome: modelName,
          disciplina: importDiscipline,
          fileBase64,
          numElementos: model.elementCount,
          numPavimentos: model.storeys.length,
          pavimentos: model.storeys.map(s => s.name),
        });
        model.dbId = result.id;
        toast.success(`Modelo "${modelName}" importado e salvo! ${model.elementCount} elementos, ${model.storeys.length} pavimentos.`);
      } catch (saveErr) {
        console.error("Erro ao salvar no servidor:", saveErr);
        toast.warning(`Modelo carregado localmente, mas não foi salvo no servidor. ${(saveErr as any)?.message || ""}`);
      }

      setModels(prev => [...prev, model]);
    } catch (err) {
      console.error("Error loading IFC:", err);
      toast.error("Erro ao carregar arquivo IFC. Verifique se é um arquivo válido.");
    } finally {
      setLoading(false);
      setLoadingMsg("");
      e.target.value = "";
    }
  };

  const toggleModelVisibility = (modelId: string) => {
    setModels(prev => prev.map(m => {
      if (m.id === modelId) {
        const newVis = !m.visible;
        m.meshes.forEach(mesh => { mesh.visible = newVis; });
        return { ...m, visible: newVis };
      }
      return m;
    }));
  };

  const removeModel = (modelId: string) => {
    const model = models.find(m => m.id === modelId);
    if (model?.dbId) {
      deleteMutation.mutate(
        { id: model.dbId, companyId },
        { onError: (err) => console.error("Erro ao excluir modelo do servidor:", err) }
      );
    }
    setModels(prev => {
      const m = prev.find(m => m.id === modelId);
      if (m && sceneRef.current) {
        m.meshes.forEach(mesh => {
          sceneRef.current!.remove(mesh);
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(mat => mat.dispose());
          } else {
            mesh.material.dispose();
          }
        });
      }
      return prev.filter(m => m.id !== modelId);
    });
    toast.success("Modelo removido");
  };

  const HIGHLIGHT_COLOR = new THREE.Color(0x00aaff);
  const SELECTED_MATERIAL = new THREE.MeshPhongMaterial({
    color: HIGHLIGHT_COLOR,
    emissive: new THREE.Color(0x003366),
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });

  const highlightMesh = (mesh: THREE.Mesh) => {
    if (!originalMaterialsRef.current.has(mesh)) {
      originalMaterialsRef.current.set(mesh, mesh.material);
    }
    mesh.material = SELECTED_MATERIAL;
  };

  const unhighlightMesh = (mesh: THREE.Mesh) => {
    const orig = originalMaterialsRef.current.get(mesh);
    if (orig) {
      mesh.material = orig;
      originalMaterialsRef.current.delete(mesh);
    }
  };

  const toggleMeshSelection = (mesh: THREE.Mesh) => {
    setSelectedMeshes(prev => {
      const next = new Set(prev);
      if (next.has(mesh)) {
        next.delete(mesh);
        unhighlightMesh(mesh);
      } else {
        next.add(mesh);
        highlightMesh(mesh);
      }
      return next;
    });
  };

  const clearSelection = () => {
    selectedMeshes.forEach(m => unhighlightMesh(m));
    setSelectedMeshes(new Set());
  };

  const getAllVisibleMeshes = useCallback((): THREE.Mesh[] => {
    const meshes: THREE.Mesh[] = [];
    if (!sceneRef.current) return meshes;
    sceneRef.current.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.visible && obj.userData.expressID) {
        meshes.push(obj);
      }
    });
    return meshes;
  }, []);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleCanvasMouseUp = (e: React.MouseEvent) => {
    if (!containerRef.current || !cameraRef.current) {
      mouseDownPosRef.current = null;
      return;
    }

    if (boxSelecting && boxStart && boxEnd) {
      const rect = containerRef.current.getBoundingClientRect();
      const x1 = Math.min(boxStart.x, boxEnd.x);
      const y1 = Math.min(boxStart.y, boxEnd.y);
      const x2 = Math.max(boxStart.x, boxEnd.x);
      const y2 = Math.max(boxStart.y, boxEnd.y);

      const camera = cameraRef.current;
      const allMeshes = getAllVisibleMeshes();

      const ndcX1 = (x1 / rect.width) * 2 - 1;
      const ndcY1 = -(y1 / rect.height) * 2 + 1;
      const ndcX2 = (x2 / rect.width) * 2 - 1;
      const ndcY2 = -(y2 / rect.height) * 2 + 1;

      const frustum = new THREE.Frustum();
      const mvpMatrix = new THREE.Matrix4();
      mvpMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

      const newSelected = new Set(selectedMeshes);

      allMeshes.forEach(mesh => {
        if (newSelected.has(mesh)) return;
        const pos = new THREE.Vector3();
        mesh.getWorldPosition(pos);
        pos.project(camera);

        if (pos.x >= ndcX1 && pos.x <= ndcX2 && pos.y <= ndcY1 && pos.y >= ndcY2 && pos.z < 1) {
          newSelected.add(mesh);
          highlightMesh(mesh);
        }
      });

      setSelectedMeshes(newSelected);
      setBoxSelecting(false);
      setBoxStart(null);
      setBoxEnd(null);
      mouseDownPosRef.current = null;
      return;
    }

    if (mouseDownPosRef.current) {
      const dx = Math.abs(e.clientX - mouseDownPosRef.current.x);
      const dy = Math.abs(e.clientY - mouseDownPosRef.current.y);
      if (dx <= 5 && dy <= 5) {
        const rect = containerRef.current.getBoundingClientRect();
        mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

        const allMeshes = getAllVisibleMeshes();
        const intersects = raycasterRef.current.intersectObjects(allMeshes, false);

        if (intersects.length > 0) {
          const mesh = intersects[0].object as THREE.Mesh;
          toggleMeshSelection(mesh);
        }
      }
    }

    setBoxSelecting(false);
    setBoxStart(null);
    setBoxEnd(null);
    mouseDownPosRef.current = null;
  };

  const handleLinkToActivity = async (atividadeId: number) => {
    if (selectedMeshes.size === 0) {
      toast.error("Selecione pelo menos um elemento 3D primeiro");
      return;
    }

    const expressIds = Array.from(selectedMeshes).map(m => m.userData.expressID || 0).filter(id => id > 0);
    const firstModel = models.find(m => m.meshes.some(mesh => selectedMeshes.has(mesh)));

    try {
      await saveLinkMutation.mutateAsync({
        projetoId,
        companyId,
        atividadeId,
        modelId: firstModel?.dbId || 0,
        expressIds,
      });
      toast.success(`${expressIds.length} elemento(s) vinculado(s) à atividade`);
      refetchLinks();
    } catch (err) {
      toast.error("Erro ao vincular elementos");
      console.error(err);
    }
  };

  const handleDeleteLink = async (linkId: number) => {
    try {
      await deleteLinkMutation.mutateAsync({ id: linkId, companyId });
      toast.success("Vinculação removida");
      refetchLinks();
    } catch (err) {
      toast.error("Erro ao remover vinculação");
    }
  };

  const filteredAtividades = (bimAtividades || []).filter(a =>
    !activitySearch || a.nome.toLowerCase().includes(activitySearch.toLowerCase()) ||
    (a.eapCodigo || "").toLowerCase().includes(activitySearch.toLowerCase())
  );

  const resetCamera = () => {
    const allMeshes = models.flatMap(m => m.meshes).filter(m => m.visible);
    if (allMeshes.length > 0) {
      fitCameraToModel(allMeshes);
    } else if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(30, 20, 30);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  const toggleStorey = (modelId: string, storeyName: string) => {
    const key = `${modelId}:${storeyName}`;
    setExpandedStoreys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const filteredModels = viewFilter === "Todas" ? models : models.filter(m => m.discipline === viewFilter);
  const totalElements = filteredModels.reduce((sum, m) => sum + m.elementCount, 0);
  const disciplineGroups = filteredModels.reduce<Record<string, IfcModel[]>>((acc, m) => {
    (acc[m.discipline] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Box className="h-5 w-5 text-blue-600" />
            <h3 className="font-bold text-slate-800">Modelo BIM 3D</h3>
          </div>
          {models.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                {filteredModels.length}/{models.length} modelo{models.length !== 1 ? "s" : ""}
              </Badge>
              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                {totalElements} elementos
              </Badge>
              {viewFilter !== "Todas" && (
                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                  {viewFilter}
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border border-slate-200 rounded-md bg-white px-1.5 py-0.5">
            <Eye className="h-3 w-3 text-slate-400" />
            <select
              className="text-xs bg-transparent border-0 outline-none pr-1 font-medium text-slate-700"
              value={viewFilter}
              onChange={e => setViewFilter(e.target.value)}
            >
              <option value="Todas">Todas Disciplinas</option>
              {DISCIPLINES.map(d => {
                const count = models.filter(m => m.discipline === d).length;
                return <option key={d} value={d}>{d}{count > 0 ? ` (${count})` : ""}</option>;
              })}
            </select>
          </div>
          <div className="w-px h-5 bg-slate-200" />
          <select
            className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
            value={importDiscipline}
            onChange={e => setImportDiscipline(e.target.value)}
          >
            {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <label className="cursor-pointer">
            <input type="file" accept=".ifc" className="hidden" onChange={handleFileUpload} disabled={loading} />
            <Button size="sm" variant="default" className="gap-1.5" asChild disabled={loading}>
              <span>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {loading ? loadingMsg : `Importar ${importDiscipline}`}
              </span>
            </Button>
          </label>
          {models.length > 0 && selectedMeshes.size > 0 && (
            <>
              <div className="w-px h-5 bg-slate-200" />
              <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200">
                {selectedMeshes.size} selecionado(s)
              </Badge>
              <Button
                size="sm" variant="default"
                className="gap-1 bg-green-600 hover:bg-green-700"
                onClick={() => { setActivitySearch(""); setLinkPanelOpen(true); }}
              >
                <Link2 className="h-3.5 w-3.5" /> Vincular
              </Button>
              <Button size="sm" variant="outline" className="gap-1 h-7 text-[10px]" onClick={clearSelection}>
                <X className="h-3 w-3" /> Limpar
              </Button>
            </>
          )}
          {models.length > 0 && (bimLinks?.length ?? 0) > 0 && (
            <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
              {bimLinks!.length} vínculo{bimLinks!.length !== 1 ? "s" : ""}
            </Badge>
          )}
          <Button size="sm" variant="outline" className="gap-1" onClick={resetCamera}>
            <Maximize className="h-3.5 w-3.5" /> Enquadrar
          </Button>
          <Button
            size="sm" variant="outline"
            className={`gap-1 ${!showGrid ? "bg-slate-100 text-slate-400" : ""}`}
            onClick={() => {
              const next = !showGrid;
              setShowGrid(next);
              if (gridRef.current) gridRef.current.visible = next;
            }}
            title={showGrid ? "Ocultar grade do piso" : "Mostrar grade do piso"}
          >
            <Grid3X3 className="h-3.5 w-3.5" /> {showGrid ? "Grid" : "Grid"}
          </Button>
          <Button
            size="sm" variant="outline"
            className={`gap-1 ${sidebarOpen ? "bg-blue-50 text-blue-700" : ""}`}
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Layers className="h-3.5 w-3.5" /> Painel
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <div className="w-72 border-r border-slate-200 bg-slate-50 overflow-y-auto flex-shrink-0">
            {filteredModels.length === 0 ? (
              <div className="p-6 text-center text-slate-400">
                <Box className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                {models.length === 0 ? (
                  <>
                    <p className="text-sm font-medium">Nenhum modelo carregado</p>
                    <p className="text-xs mt-1">Importe um arquivo .ifc para começar</p>
                    <p className="text-[10px] mt-3 text-slate-400">
                      Cada disciplina (estrutural, arquitetura, etc.) pode ser importada separadamente e o ERP vincula automaticamente.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">Nenhum modelo de "{viewFilter}"</p>
                    <p className="text-xs mt-1">Importe um .ifc com essa disciplina ou selecione "Todas Disciplinas"</p>
                  </>
                )}
              </div>
            ) : (
              <div className="p-2 space-y-2">
                {Object.entries(disciplineGroups).map(([disc, groupModels]) => (
                  <div key={disc} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-50 to-slate-50 border-b border-slate-100">
                      <Palette className="h-3.5 w-3.5 text-blue-600" />
                      <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">{disc}</span>
                      <Badge variant="outline" className="ml-auto text-[9px]">
                        {groupModels.length}
                      </Badge>
                    </div>
                    {groupModels.map(model => (
                      <div key={model.id} className="border-b border-slate-50 last:border-0">
                        <div className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-slate-50">
                          <button
                            className="p-0.5 rounded hover:bg-slate-100"
                            onClick={() => toggleModelVisibility(model.id)}
                            title={model.visible ? "Ocultar" : "Mostrar"}
                          >
                            {model.visible
                              ? <Eye className="h-3.5 w-3.5 text-blue-600" />
                              : <EyeOff className="h-3.5 w-3.5 text-slate-400" />}
                          </button>
                          <span className="text-[11px] font-medium text-slate-700 truncate flex-1" title={model.name}>
                            {model.name}
                          </span>
                          <span className="text-[9px] text-slate-400">{model.elementCount}</span>
                          <button
                            className="p-0.5 rounded hover:bg-red-50"
                            onClick={() => removeModel(model.id)}
                            title="Remover modelo"
                          >
                            <Trash2 className="h-3 w-3 text-slate-400 hover:text-red-500" />
                          </button>
                        </div>
                        {model.storeys.length > 0 && (
                          <div className="pl-4 pb-1">
                            {model.storeys.map(st => (
                              <div key={st.name}>
                                <button
                                  className="flex items-center gap-1 w-full text-left px-1.5 py-0.5 text-[10px] hover:bg-slate-100 rounded"
                                  onClick={() => toggleStorey(model.id, st.name)}
                                >
                                  {expandedStoreys.has(`${model.id}:${st.name}`)
                                    ? <ChevronDown className="h-3 w-3 text-slate-400" />
                                    : <ChevronRight className="h-3 w-3 text-slate-400" />}
                                  <span className="font-medium text-slate-600">{st.name}</span>
                                  <span className="ml-auto text-slate-400">
                                    {st.elements.length} el.
                                  </span>
                                </button>
                                {expandedStoreys.has(`${model.id}:${st.name}`) && (
                                  <div className="pl-4 space-y-0.5 pb-1">
                                    {st.elements.slice(0, 50).map(el => (
                                      <div
                                        key={el.expressId}
                                        className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer hover:bg-blue-50
                                          ${selectedElement?.expressId === el.expressId ? "bg-blue-100 text-blue-800" : "text-slate-500"}`}
                                        onClick={() => setSelectedElement(el)}
                                      >
                                        <span className="font-medium">{el.name}</span>
                                        <span className="text-slate-400 ml-1">({el.type})</span>
                                      </div>
                                    ))}
                                    {st.elements.length > 50 && (
                                      <p className="text-[9px] text-slate-400 pl-1.5">
                                        +{st.elements.length - 50} elementos...
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div
          ref={containerRef}
          className="flex-1 relative bg-gradient-to-br from-slate-100 to-blue-50"
          onMouseDown={handleCanvasMouseDown}
          onMouseUp={handleCanvasMouseUp}
        >
          {models.length === 0 && !loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center max-w-md px-8">
                <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
                  <Box className="h-12 w-12 text-blue-500" />
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-2">Visualizador BIM 3D</h3>
                <p className="text-sm text-slate-500 mb-4">
                  Importe arquivos .ifc para visualizar o modelo 3D da obra diretamente no ERP.
                  Cada disciplina pode ser importada separadamente.
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 mb-6">
                  <div className="flex items-center gap-1.5 bg-white rounded-lg px-3 py-2 border border-slate-200">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    Estrutural (TQS)
                  </div>
                  <div className="flex items-center gap-1.5 bg-white rounded-lg px-3 py-2 border border-slate-200">
                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                    Arquitetura (Revit)
                  </div>
                  <div className="flex items-center gap-1.5 bg-white rounded-lg px-3 py-2 border border-slate-200">
                    <div className="w-2 h-2 rounded-full bg-cyan-400" />
                    Hidráulica
                  </div>
                  <div className="flex items-center gap-1.5 bg-white rounded-lg px-3 py-2 border border-slate-200">
                    <div className="w-2 h-2 rounded-full bg-yellow-400" />
                    Elétrica
                  </div>
                </div>
                <label className="cursor-pointer">
                  <input type="file" accept=".ifc" className="hidden" onChange={handleFileUpload} />
                  <Button size="lg" className="gap-2" asChild>
                    <span><Upload className="h-4 w-4" /> Importar arquivo .ifc</span>
                  </Button>
                </label>
              </div>
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">{loadingMsg}</p>
              </div>
            </div>
          )}
          {boxSelecting && boxStart && boxEnd && (
            <div
              className="absolute border-2 border-orange-500 bg-orange-200/20 z-20 pointer-events-none"
              style={{
                left: Math.min(boxStart.x, boxEnd.x),
                top: Math.min(boxStart.y, boxEnd.y),
                width: Math.abs(boxEnd.x - boxStart.x),
                height: Math.abs(boxEnd.y - boxStart.y),
              }}
            />
          )}
          {selectedElement && selectedMeshes.size === 0 && (
            <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg border border-slate-200 p-3 z-10 max-w-xs">
              <div className="flex items-center gap-2 mb-1">
                <Info className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-xs font-bold text-slate-800">{selectedElement.name}</span>
                <button className="ml-auto" onClick={() => setSelectedElement(null)}>
                  <EyeOff className="h-3 w-3 text-slate-400" />
                </button>
              </div>
              <div className="text-[10px] text-slate-500 space-y-0.5">
                <p>Tipo: <strong>{selectedElement.type}</strong></p>
                <p>Pavimento: <strong>{selectedElement.storey || "—"}</strong></p>
                <p>ID: <strong>#{selectedElement.expressId}</strong></p>
              </div>
            </div>
          )}
          {selectedMeshes.size > 0 && (
            <div className="absolute bottom-4 left-4 bg-blue-50 rounded-lg shadow-lg border border-blue-200 p-3 z-10 max-w-xs">
              <div className="flex items-center gap-2 mb-1">
                <MousePointer2 className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-xs font-bold text-blue-800">{selectedMeshes.size} elemento(s) selecionado(s)</span>
              </div>
              <div className="flex gap-1 mt-1">
                <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={clearSelection}>
                  <X className="h-3 w-3" /> Limpar
                </Button>
                <Button size="sm" className="h-6 text-[10px] gap-1 bg-green-600 hover:bg-green-700" onClick={() => { setActivitySearch(""); setLinkPanelOpen(true); }}>
                  <Link2 className="h-3 w-3" /> Vincular a atividade
                </Button>
              </div>
              <p className="text-[9px] text-blue-500 mt-1">ESC para limpar seleção</p>
            </div>
          )}
          {linkPanelOpen && (
            <div className="absolute inset-0 bg-black/30 z-30 flex items-center justify-center" onClick={() => setLinkPanelOpen(false)}>
              <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-[420px] max-h-[80%] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-green-50 to-blue-50 rounded-t-xl">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-bold text-slate-800">Vincular a Atividade</span>
                    <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200">
                      {selectedMeshes.size} elemento(s)
                    </Badge>
                  </div>
                  <span className="text-[9px] text-slate-400 mr-6">
                    {bimAtividades?.length ? `${bimAtividades.length} atividade(s) · Vincule a múltiplas` : "Carregando..."}
                  </span>
                  <button onClick={() => setLinkPanelOpen(false)} className="p-1 rounded hover:bg-slate-100">
                    <X className="h-4 w-4 text-slate-400" />
                  </button>
                </div>
                <div className="px-4 py-2 border-b border-slate-100">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar atividade pelo nome ou EAP..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={activitySearch}
                      onChange={e => setActivitySearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto max-h-[400px]">
                  {filteredAtividades.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-xs">
                      {bimAtividades?.length === 0 ? "Nenhuma atividade no cronograma aprovado" : "Nenhuma atividade encontrada"}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {filteredAtividades.map(a => {
                        const alreadyLinked = bimLinks?.some(l => l.atividadeId === a.id);
                        return (
                          <button
                            key={a.id}
                            className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors group ${alreadyLinked ? "bg-green-50/50" : ""}`}
                            onClick={() => handleLinkToActivity(a.id)}
                          >
                            <div className="flex items-center gap-2">
                              {a.eapCodigo && (
                                <span className="text-[10px] text-white bg-blue-500 rounded px-1.5 py-0.5 font-mono font-bold flex-shrink-0">{a.eapCodigo}</span>
                              )}
                              <span className="text-xs text-slate-700 font-medium truncate flex-1">{a.nome}</span>
                              {alreadyLinked && <Badge variant="outline" className="text-[8px] h-4 bg-green-50 text-green-600 border-green-200">vinculada</Badge>}
                              <Check className="h-3.5 w-3.5 text-green-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                            </div>
                            <div className="flex items-center gap-3 mt-0.5" style={{ paddingLeft: a.eapCodigo ? `${a.eapCodigo.length * 7 + 16}px` : "0" }}>
                              {a.inicio && <span className="text-[9px] text-slate-400">{a.inicio}</span>}
                              {a.fim && <span className="text-[9px] text-slate-400">→ {a.fim}</span>}
                              {a.progressoReal > 0 && (
                                <span className="text-[9px] text-green-600 font-medium">{a.progressoReal}%</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {models.length > 0 && (
            <div className="absolute top-3 left-3 bg-white/90 backdrop-blur rounded-lg shadow-sm border border-slate-200 px-3 py-1.5 z-10">
              <p className="text-[10px] text-slate-500">
                Clique para selecionar | Arrastar: rotacionar | Scroll: zoom | Botão direito: mover
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
