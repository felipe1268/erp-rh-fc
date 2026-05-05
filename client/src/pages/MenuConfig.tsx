import DashboardLayout from "@/components/DashboardLayout";
import MenuConfigPanel from "@/components/MenuConfigPanel";

export default function MenuConfigPage() {
  return (
    <DashboardLayout>
      <div className="p-2 sm:p-4 max-w-5xl mx-auto">
        <MenuConfigPanel />
      </div>
    </DashboardLayout>
  );
}
